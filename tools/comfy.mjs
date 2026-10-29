/**
 * 로컬 ComfyUI(Pinokio, 127.0.0.1:8188) 클라이언트 + 워크플로.
 * 워크플로는 docs/grand-strategy/portrait-poc/scripts/run_poc.py 의 검증된 것을 그대로 옮겼다
 * (Z-Image-Turbo 8스텝 res_multistep shift 3 / Qwen-Image-Edit-2511 + Lightning 4스텝).
 * 도트: Z-Image 에 도트 LoRA(Apache 2.0) 를 얹는다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

export const HOST = process.env.COMFY_HOST || '127.0.0.1:8188';
const BASE = 'http://' + HOST;
export const COMFY_DIR = 'C:/pinokio/api/inteliweb-comfyui/app';
const INPUT_DIR = path.join(COMFY_DIR, 'input');

export const LORAS = {
  tarn: { file: 'pixel_art_style_z_image_turbo.safetensors', trigger: 'Pixel art style.' },
  redmond: { file: 'PixelArt_Redmond_ZImageTurbo.safetensors', trigger: 'Pixel Art, PixArFK.' },
};

async function req(p, body) {
  const r = await fetch(BASE + p, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('ComfyUI ' + r.status + ' ' + (await r.text()).slice(0, 800));
  const t = await r.text(); return t ? JSON.parse(t) : null;
}
export async function alive() { try { await req('/system_stats'); return true; } catch { return false; } }

/** ComfyUI 를 띄운다(이미 떠 있으면 그대로). 창 없이 백그라운드로, 로그는 tools/.cache/comfy.log */
export async function ensureComfy() {
  if (await alive()) return;
  const log = path.resolve('tools/.cache/comfy.log'); fs.mkdirSync(path.dirname(log), { recursive: true });
  const out = fs.openSync(log, 'a');
  const py = path.join(COMFY_DIR, 'env/Scripts/python.exe');
  const p = spawn(py, ['main.py', '--listen', '127.0.0.1', '--port', HOST.split(':')[1]], { cwd: COMFY_DIR, detached: true, stdio: ['ignore', out, out], env: { ...process.env, COMFY_NO_TELEMETRY: '1', TOKENIZERS_PARALLELISM: 'false' }, windowsHide: true });
  p.unref();
  for (let i = 0; i < 180; i++) { await new Promise(r => setTimeout(r, 1000)); if (await alive()) return; }
  throw new Error('ComfyUI 가 3분 안에 뜨지 않았다. 로그: ' + log);
}

/** 워크플로를 돌리고 첫 출력 그림(Buffer)을 돌려준다 */
export async function run(wf) {
  const { prompt_id } = await req('/prompt', { prompt: wf, client_id: 'mercenary' });
  for (;;) {
    await new Promise(r => setTimeout(r, 300));
    const h = await req('/history/' + prompt_id); const e = h?.[prompt_id]; if (!e) continue;
    if (e.status?.status_str === 'error') throw new Error(JSON.stringify(e.status.messages).slice(0, 1500));
    if (!e.status?.completed) continue;
    for (const n of Object.values(e.outputs)) for (const img of n.images ?? []) {
      const q = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder, type: img.type });
      const r = await fetch(BASE + '/view?' + q); return Buffer.from(await r.arrayBuffer());
    }
    throw new Error('출력 그림 없음');
  }
}
export async function free() { try { await req('/free', { unload_models: true, free_memory: true }); } catch { /* ignore */ } }
/** 입력 그림을 ComfyUI input 폴더에 둔다 */
export function putInput(name, buf) { fs.mkdirSync(INPUT_DIR, { recursive: true }); fs.writeFileSync(path.join(INPUT_DIR, name), buf); return name; }

/**
 * Z-Image-Turbo (+ 선택 LoRA). image 가 있으면 img2img(denoise < 1): 원본 구도·얼굴을 살린 채 화풍만 바꾼다.
 */
export function wfZImage({ prompt, seed = 1001, width = 1024, height = 1024, lora = null, loraStrength = 1.0, image = null, denoise = 1.0, steps = 8 }) {
  const wf = {
    1: { class_type: 'UNETLoader', inputs: { unet_name: 'z_image_turbo_bf16.safetensors', weight_dtype: 'default' } },
    2: { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen_3_4b.safetensors', type: 'lumina2', device: 'default' } },
    3: { class_type: 'VAELoader', inputs: { vae_name: 'ae.safetensors' } },
  };
  let model = ['1', 0];
  if (lora) { wf[20] = { class_type: 'LoraLoaderModelOnly', inputs: { model, lora_name: LORAS[lora].file, strength_model: loraStrength } }; model = ['20', 0]; }
  const text = (lora ? LORAS[lora].trigger + ' ' : '') + prompt;
  Object.assign(wf, {
    4: { class_type: 'ModelSamplingAuraFlow', inputs: { model, shift: 3.0 } },
    5: { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text } },
    6: { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['5', 0] } },
  });
  if (image) {
    wf[30] = { class_type: 'LoadImage', inputs: { image } };
    wf[31] = { class_type: 'ImageScale', inputs: { image: ['30', 0], upscale_method: 'lanczos', width, height, crop: 'center' } };
    wf[7] = { class_type: 'VAEEncode', inputs: { pixels: ['31', 0], vae: ['3', 0] } };
  } else wf[7] = { class_type: 'EmptySD3LatentImage', inputs: { width, height, batch_size: 1 } };
  wf[8] = { class_type: 'KSampler', inputs: { model: ['4', 0], positive: ['5', 0], negative: ['6', 0], latent_image: ['7', 0], seed, steps, cfg: 1.0, sampler_name: 'res_multistep', scheduler: 'simple', denoise } };
  wf[9] = { class_type: 'VAEDecode', inputs: { samples: ['8', 0], vae: ['3', 0] } };
  wf[10] = { class_type: 'SaveImage', inputs: { images: ['9', 0], filename_prefix: 'mercenary/z' } };
  return wf;
}

/** Qwen-Image-Edit-2511 + Lightning 4스텝: 지시문대로 그림을 고친다(배치·얼굴 유지가 강하다) */
export function wfQwenEdit({ image, instruction, seed = 1001 }) {
  return {
    1: { class_type: 'UNETLoader', inputs: { unet_name: 'qwen_image_edit_2511_fp8mixed.safetensors', weight_dtype: 'default' } },
    2: { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen_2.5_vl_7b_fp8_scaled.safetensors', type: 'qwen_image', device: 'default' } },
    3: { class_type: 'VAELoader', inputs: { vae_name: 'qwen_image_vae.safetensors' } },
    4: { class_type: 'LoadImage', inputs: { image } },
    5: { class_type: 'FluxKontextImageScale', inputs: { image: ['4', 0] } },
    6: { class_type: 'TextEncodeQwenImageEditPlus', inputs: { clip: ['2', 0], vae: ['3', 0], image1: ['5', 0], prompt: instruction } },
    7: { class_type: 'TextEncodeQwenImageEditPlus', inputs: { clip: ['2', 0], vae: ['3', 0], image1: ['5', 0], prompt: '' } },
    8: { class_type: 'FluxKontextMultiReferenceLatentMethod', inputs: { conditioning: ['6', 0], reference_latents_method: 'index_timestep_zero' } },
    9: { class_type: 'FluxKontextMultiReferenceLatentMethod', inputs: { conditioning: ['7', 0], reference_latents_method: 'index_timestep_zero' } },
    10: { class_type: 'VAEEncode', inputs: { pixels: ['5', 0], vae: ['3', 0] } },
    11: { class_type: 'LoraLoaderModelOnly', inputs: { model: ['1', 0], lora_name: 'Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors', strength_model: 1.0 } },
    12: { class_type: 'ModelSamplingAuraFlow', inputs: { model: ['11', 0], shift: 3.1 } },
    13: { class_type: 'CFGNorm', inputs: { model: ['12', 0], strength: 1.0 } },
    14: { class_type: 'KSampler', inputs: { model: ['13', 0], positive: ['8', 0], negative: ['9', 0], latent_image: ['10', 0], seed, steps: 4, cfg: 1.0, sampler_name: 'euler', scheduler: 'simple', denoise: 1.0 } },
    15: { class_type: 'VAEDecode', inputs: { samples: ['14', 0], vae: ['3', 0] } },
    16: { class_type: 'SaveImage', inputs: { images: ['15', 0], filename_prefix: 'mercenary/qe' } },
  };
}

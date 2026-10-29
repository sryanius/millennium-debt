#!/usr/bin/env bash
# 로컬 그림 AI 모델 받기(2026-10-29 사용자 허락: Z-Image-Turbo + Qwen-Image-Edit-2511 Lightning, 약 51.7GB).
# 출처는 Hugging Face 공개 저장소(Apache 2.0, docs/grand-strategy/portrait-poc/LICENSES.md). 끊기면 다시 돌리면 이어 받는다(curl -C -).
set -u
P=/c/pinokio/drive/drives/peers/d1780459804901
HF=https://huggingface.co
get() { # repo path dest
  local url="$HF/$1/resolve/main/$2" out="$P/$3"
  mkdir -p "$(dirname "$out")"
  echo "[$(date +%H:%M:%S)] start $3"
  curl -L --fail --retry 5 --retry-delay 5 -C - -o "$out.part" "$url" -s -S && mv -f "$out.part" "$out" && echo "[$(date +%H:%M:%S)] done  $3 $(du -h "$out" | cut -f1)" || echo "[$(date +%H:%M:%S)] FAIL  $3"
}
# 작은 것부터(VAE·LoRA) → 텍스트 인코더 → 본체
get Comfy-Org/z_image_turbo split_files/vae/ae.safetensors vae/ae.safetensors
get Comfy-Org/Qwen-Image_ComfyUI split_files/vae/qwen_image_vae.safetensors vae/qwen_image_vae.safetensors
get lightx2v/Qwen-Image-Edit-2511-Lightning Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors loras/Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors
get Comfy-Org/z_image_turbo split_files/text_encoders/qwen_3_4b.safetensors text_encoders/qwen_3_4b.safetensors
get Comfy-Org/Qwen-Image_ComfyUI split_files/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors
get Comfy-Org/z_image_turbo split_files/diffusion_models/z_image_turbo_bf16.safetensors diffusion_models/z_image_turbo_bf16.safetensors
get Comfy-Org/Qwen-Image-Edit_ComfyUI split_files/diffusion_models/qwen_image_edit_2511_fp8mixed.safetensors diffusion_models/qwen_image_edit_2511_fp8mixed.safetensors
echo "[$(date +%H:%M:%S)] ALL DONE"

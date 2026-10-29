/** 수치 가안. 전부 한곳에 모아 밸런스 조정이 쉽게. */
export const BALANCE = {
  // 달력(GDD §2.1): 1달 28일, 1년 12달. 상환일 7·14·21·28.
  daysPerMonth: 28,
  monthsPerYear: 12,
  repaymentDays: [7, 14, 21, 28] as readonly number[],
  secondsPerDay: 12, // 속도 ×1 기준 실시간 1일

  // 돈(GDD §8)
  startYear: 1000,
  startMonth: 3,
  startDay: 1,
  startCash: 30_000,
  startDebt: 10_000_000,
  minRepayment: 5_000,
  missedPenalty: 100_000, // 상환일에 돈이 아예 없을 때 가산
  extraRepaymentChoices: [5_000, 10_000, 50_000, 100_000, 500_000, 1_000_000, 5_000_000] as readonly number[],

  // 이동: 지도 좌표 단위/일. 샹파르→오르블랑(20단위) = 2일
  marchSpeed: 10,

  // 교역
  carryPerMember: 50, // 1인당 적재 단위(짐수레 포함)
  buySpread: 1.15,
  sellSpread: 0.85,
  tradeSkillMax: 100, // T 100이면 양쪽 가격 ×0.5 (원작의 "상업력이 높으면 이익이 준다")
  stockRegenPerDay: 0.05, // 재고가 기준치로 하루에 돌아가는 비율
  priceNoise: 0.08,
  homePriceMul: 0.72, // 특산지 값(기준가 대비)
  hopPriceMul: 0.17, // 지역 하나 멀어질 때마다 값 +
  siteVariance: 0.15, // 같은 지역 안 거점끼리의 고정 가격 차(지역 안 왕복 교역의 근거)

  // 민사 게시판
  boardRefreshDays: 3,
  boardSlots: 3,
  civilBaseReward: 400,
  civilRewardPerUnit: 45, // 경로 길이 1단위당
  civilDeadlineSlack: 3, // 최소 이동일 + 여유일
  civilLatePenaltyRate: 0.5, // 기한 초과 시 보수 비율(위약)

  // 2단계: 고용·급료·피로·병원
  contractRefreshDays: 7,
  wageDay: 1, // 매달 1일 급료
  fatigueMarchPerDay: 3,
  fatigueRestPerDay: -6,
  fatigueBattle: 12,
  healRestPerDay: 2,
  hospitalPerHp: 15,
  hospitalPerFatigue: 5,

  // 전투(전장 단위: 타원 가로 ±100, 세로 ±50)
  battleHitBase: 0.85,
  battleFatigueHitLoss: 0.004, // 피로 1당 명중 −
  battlePotionAt: 0.35, // HP 비율이 이 밑이면 회복약 자동 사용
  battleRetreatSpeed: 30,
  banditBountyPerUnit: 250,

  // 군사 게시판 토벌 의뢰
  militaryRefreshDays: 5,
  militaryBaseReward: 3_000,
  militaryRewardPerTier: 3_500,

  // 집행관 호위대: 상환을 미룰 때마다 단계 ↑(최대 5)
  escortMaxLevel: 5,

  // 3단계: 공연(술집)
  showCooldownDays: 3,
  showIncomePerPower: 6, // 수입 = 공연력 × 성 규모 × 이 값
  showFailPowerPerSize: 18, // 공연력 < 규모 × 이 값이면 실패
  showFailPenaltyPerSize: 600, // 실패 위약금 = 규모 × 이 값(원작: 위약금 큼)

  // 건축
  buildRefreshDays: 10,
  buildRepairWorkPerPoint: 6, // 내구 1 복구에 드는 작업량
  buildRepairRewardPerPoint: 110,
  buildWallsWork: 900, buildWallsReward: 24_000,
  buildFatiguePerDay: 4,

  // 잿빛 교단(반란군)
  rebelStartDay: 12,
  rebelSpawnChance: 0.015, // 점령 성마다 하루 확률
  rebelMaxBands: 2,
  rebelMaxHeld: 16, // 점령지가 이만큼이면 더 나서지 않는다
  rebelMoveDays: 2, // 간선 하나 지나는 데
  rebelSiegeDamage: 5, // 하루 내구 피해
  lordRetakeChance: 0.06, // 달마다 점령지 하나당 영주가 되찾을 확률(교단 와해 뒤 ×3)
  liberateRewardCastle: 150_000,
  liberateRewardMinor: 40_000,

  // 떠돌이 도적단
  roamSpawnDays: 8, roamMaxBands: 3, roamMoveDays: 4,

  // 4단계: 배편(항구 ↔ 항구, 거리 ≤ 이 값), 뱃삯 1인당
  ferryMaxDistance: 70, ferrySpeedMul: 1.5, ferryFarePerHead: 40,
  // 사막(R05)은 보급이 두 배로 든다 → 행군 피로 ×2
  desertFatigueMul: 2,
  // 1004년 피난민 호송: 민사 보수 ×3
  refugeeRewardMul: 3,
};

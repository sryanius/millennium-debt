import { BALANCE } from './balance';

export interface GameDate { year: number; month: number; day: number }

/** 실시간 시계. 하루가 secondsPerDay 초. speed 0 = 정지. */
export class GameClock {
  year: number; month: number; day: number;
  /** 0..1, 하루 안의 진행도 */
  frac = 0;
  speed = 1;
  constructor(d: GameDate = { year: BALANCE.startYear, month: BALANCE.startMonth, day: BALANCE.startDay }) {
    this.year = d.year; this.month = d.month; this.day = d.day;
  }
  get date(): GameDate { return { year: this.year, month: this.month, day: this.day }; }
  get isRepaymentDay(): boolean { return BALANCE.repaymentDays.includes(this.day); }
  /** 다음 상환일까지 남은 일수(오늘이 상환일이면 0) */
  get daysToRepayment(): number {
    for (const d of BALANCE.repaymentDays) if (d >= this.day) return d - this.day;
    return BALANCE.daysPerMonth - this.day + BALANCE.repaymentDays[0];
  }
  /** dt초만큼 진행. 넘어간 날 수를 돌려준다(보통 0 또는 1). */
  advance(dtSeconds: number): number {
    if (this.speed <= 0) return 0;
    this.frac += (dtSeconds * this.speed) / BALANCE.secondsPerDay;
    let days = 0;
    while (this.frac >= 1) { this.frac -= 1; this.nextDay(); days++; }
    return days;
  }
  nextDay(): void {
    this.day++;
    if (this.day > BALANCE.daysPerMonth) {
      this.day = 1; this.month++;
      if (this.month > BALANCE.monthsPerYear) { this.month = 1; this.year++; }
    }
  }
  /** 시작일부터 센 통산 일수 */
  get dayIndex(): number {
    return ((this.year - BALANCE.startYear) * BALANCE.monthsPerYear + (this.month - 1)) * BALANCE.daysPerMonth + this.day;
  }
  static format(d: GameDate): string {
    return `${String(d.year).padStart(4, '0')}/${String(d.month).padStart(2, '0')}/${String(d.day).padStart(2, '0')}`;
  }
  toJSON() { return { year: this.year, month: this.month, day: this.day, frac: this.frac, speed: this.speed }; }
  static fromJSON(j: ReturnType<GameClock['toJSON']>): GameClock {
    const c = new GameClock(j); c.frac = j.frac; c.speed = j.speed; return c;
  }
}

import { BALANCE } from './balance';

/** 돈 버는 다섯 길(GDD §2.1). 엔딩 판정 재료. */
export type IncomeSource = 'battle' | 'trade' | 'show' | 'build' | 'civil';
export const INCOME_SOURCES: readonly IncomeSource[] = ['battle', 'trade', 'show', 'build', 'civil'];
export const INCOME_LABEL: Record<IncomeSource, string> = {
  battle: '전투', trade: '교역', show: '공연', build: '건축', civil: '민사',
};
export type SpendKind = 'equipment' | 'wages' | 'goods' | 'other';

export interface LedgerJSON {
  cash: number; debt: number;
  earned: Record<IncomeSource, number>;
  spent: Record<SpendKind, number>;
  repaid: number; missed: number;
}

/** 소지금·부채·수입 내역. 금액은 정수 골. */
export class Ledger {
  cash = BALANCE.startCash;
  debt = BALANCE.startDebt;
  earned: Record<IncomeSource, number> = { battle: 0, trade: 0, show: 0, build: 0, civil: 0 };
  spent: Record<SpendKind, number> = { equipment: 0, wages: 0, goods: 0, other: 0 };
  repaid = 0;
  missed = 0;

  get minRepayment(): number { return Math.min(BALANCE.minRepayment, this.debt); }
  get isPaidOff(): boolean { return this.debt <= 0; }

  earn(source: IncomeSource, amount: number): void {
    amount = Math.max(0, Math.floor(amount));
    this.cash += amount; this.earned[source] += amount;
  }
  /** 돈이 모자라면 false, 아무것도 바꾸지 않는다. */
  spend(kind: SpendKind, amount: number): boolean {
    amount = Math.max(0, Math.floor(amount));
    if (amount > this.cash) return false;
    this.cash -= amount; this.spent[kind] += amount; return true;
  }
  /** 상환일 처리. 기본상환액이 있으면 자동 차감, 없으면 가산금. */
  repaymentDay(): { paid: number; penalty: number } {
    const paid = this.payDue();
    if (paid > 0) return { paid, penalty: 0 };
    return { paid: 0, penalty: this.penalize() };
  }
  /** 기본상환액을 낼 수 있으면 내고 금액을, 못 내면 0을 돌려준다(아무것도 바꾸지 않음). */
  payDue(): number {
    const due = this.minRepayment;
    if (this.cash < due) return 0;
    this.cash -= due; this.debt -= due; this.repaid += due; return due;
  }
  /** 미납 가산금 */
  penalize(): number { this.missed++; this.debt += BALANCE.missedPenalty; return BALANCE.missedPenalty; }
  /** 집행관 대화의 추가 상환. 부채보다 많이 내지는 않는다. */
  repayExtra(amount: number): number {
    amount = Math.min(Math.floor(amount), this.cash, this.debt);
    if (amount <= 0) return 0;
    this.cash -= amount; this.debt -= amount; this.repaid += amount; return amount;
  }
  /** 가장 많이 번 수단(GDD §2.6). 동률이면 앞 순서. */
  get endingSource(): IncomeSource {
    let best: IncomeSource = 'battle';
    for (const s of INCOME_SOURCES) if (this.earned[s] > this.earned[best]) best = s;
    return best;
  }
  toJSON(): LedgerJSON {
    return { cash: this.cash, debt: this.debt, earned: { ...this.earned }, spent: { ...this.spent }, repaid: this.repaid, missed: this.missed };
  }
  static fromJSON(j: LedgerJSON): Ledger {
    const l = new Ledger(); Object.assign(l, j, { earned: { ...j.earned }, spent: { ...j.spent } }); return l;
  }
}

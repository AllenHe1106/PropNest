export interface LateFeeConfig {
  type: 'flat' | 'percentage';
  amount: number;
  rentAmount: number;
}

export function calculateLateFee(config: LateFeeConfig): number {
  if (config.type === 'flat') {
    return config.amount;
  }
  return config.rentAmount * (config.amount / 100);
}

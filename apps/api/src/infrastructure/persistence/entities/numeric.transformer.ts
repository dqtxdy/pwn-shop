import { ValueTransformer } from 'typeorm';

export const numericTransformer: ValueTransformer = {
  to(value: number | null | undefined): string | null | undefined {
    return value === null || value === undefined ? value : String(value);
  },
  from(value: string | null | undefined): number | null | undefined {
    return value === null || value === undefined ? value : Number(value);
  }
};

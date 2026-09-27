# Project architecture rules

- Keep Investments, Debts, and Debt Payments isolated from transactions and every financial aggregate because they are manual tracking modules only.
- Use `/app/financas/estrutura` as a layout route with index, investments, and debts leaves so each area remains directly addressable.

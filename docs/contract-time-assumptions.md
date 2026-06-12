# Smart Contract Time Assumptions

This system uses EVM `block.timestamp` for day-scale lifecycle checks:

- loan due dates and liquidation windows
- layaway deadlines and forfeiture windows
- fractionalization timestamps for audit events

`block.timestamp` is acceptable here because these rules are measured in days or months, not seconds. Validators can influence timestamps slightly, so contracts and off-chain workflows must not use timestamp checks for high-frequency pricing, auction sniping, or same-block fairness.

## Engineering Rules

| Area | Current Use | Required Tolerance |
| --- | --- | --- |
| Pawn loans | Due date and default checks | Treat repayment close to deadline as user-safe; UI should avoid encouraging last-block repayment. |
| Layaway | Deadline and forfeiture checks | Apply a business grace policy off-chain before staff triggers forfeiture. |
| Fractionalization | Event/audit timestamps | Timestamp is informational and must not be used as a price oracle. |

## Production Hardening Path

1. Add explicit grace-period constants for repayment and layaway forfeiture.
2. Emit events when grace periods start and end so the backend can index them.
3. Use backend reminders before deadlines.
4. Keep all tests using time-warp helpers so deadline behavior stays deterministic.
5. Document timezone display in the frontend; store and compare contract times as UTC.

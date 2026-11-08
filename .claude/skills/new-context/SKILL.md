---
name: new-context
description: Scaffold a new bounded context in the OnlineJudge backend following the identity context's layout and the dependency rules in CLAUDE.md.
---

# New bounded context

1. Confirm the context name, its aggregates, the contexts it may depend on (must respect the direction in `CLAUDE.md`) and the events it publishes. Stop if the dependency direction would be violated; propose events instead.
2. Create `src/backend/src/modules/<context>/` with:
   - `domain/`: one file per aggregate (class with private state, static factory, behaviour methods that enforce invariants, `DomainError` subclasses), `<aggregate>.repository.ts` as an abstract class.
   - `application/`: `<context>.service.ts` (use cases taking an `Actor`), `<context>.facade.ts` (what other contexts may call), `ports.ts` (what this context needs from others or from infrastructure).
   - `infrastructure/`: `<aggregate>.orm-entity.ts`, `typeorm-<aggregate>.repository.ts` mapping entity to aggregate both ways, adapters for ports.
   - `presentation/`: `<context>.controller.ts` with DTO classes (class-validator), `@Roles` on every non-public route.
   - `<context>.events.ts`: event names and payload types.
   - `<context>.module.ts`: providers bound to abstract classes, exports the facade only.
3. Add request and response types to `src/shared/src/api.ts` and build contracts.
4. Register the module in `app.module.ts` and the ORM entity in the TypeORM config.
5. Add `src/backend/test/<context>.test.ts` with in-memory repositories covering each invariant and each use case.
6. Document the endpoints in `docs/API.md` and the context in `README.md` under "Bounded contexts".

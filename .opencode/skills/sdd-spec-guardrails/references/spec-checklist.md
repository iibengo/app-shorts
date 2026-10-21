# Spec checklist

- [ ] Status and date are explicit.
- [ ] Relationship to prior specs is explicit.
- [ ] Every incompatible clause has an amendment/supersession entry.
- [ ] User stories have independent tests.
- [ ] Acceptance scenarios are concrete and verifiable.
- [ ] Data contract is in `app/models/`, readonly, no `File`/`Blob`/`any`.
- [ ] API contract includes routes, payloads, status codes, errors and headers.
- [ ] Server boundaries are SOLID and reuse `server/fal/`, `server/shared/`, `server/story/`.
- [ ] State machine includes terminal, cancel, retry and recovery states.
- [ ] Security covers keys, allowlists, logs, rate limits and lifecycle.
- [ ] Cost is bounded and measurable.
- [ ] Accessibility, copy and testids are specified.
- [ ] Test plan covers unit, route, component, acceptance and regressions.
- [ ] Out-of-scope and opt-in smokes are explicit.
- [ ] Open gates are non-blocking and owned.
- [ ] Checkpoint 1 and Checkpoint 2 are respected.

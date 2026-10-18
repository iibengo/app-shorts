---
description: Run the full SDD development workflow (Architect -> Developer -> Tester)
agent: ionias
---

Execute the complete Spec-Driven Development (SDD) workflow for the following feature or request: $ARGUMENTS

Follow these steps sequentially:
1. Invoke the architect agent to generate the formal technical specifications.
2. Once the spec is ready, invoke the developer agent (DeepSeek) to implement the code using Nuxt 4, Vue 3, and Tailwind CSS.
3. Once implementation finishes, invoke the tester agent to run and validate tests.
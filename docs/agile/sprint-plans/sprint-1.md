# Sprint 1 Plan

**Duration:** Weeks 1–3
**Goal:** Get the core scaffold running for every team member and close the
highest-priority gaps from the product backlog.

## Sprint backlog

| Task | Owner | Priority |
|---|---|---|
| Replace demo face descriptor with real face-api.js model | ML/Computer Vision Lead | High |
| "My open sessions" endpoint + student-facing picker | Developer — Registration & Scheduling | High |
| Venue pre-registration UI for admins | Developer — Registration & Scheduling | Medium |
| Password reset flow | Backend/Database Developer | Medium |
| Input validation hardening on registration/session forms | Backend/Database Developer + Developer — Registration | Medium |
| Use case diagram + requirements changelog | System Analyst | High |
| UI mockups (login, check-in, dashboard) + mobile responsiveness | UI/UX Designer | Medium |
| Test plan + test cases for FR-1, FR-2, FR-5, FR-6, FR-7 | Tester/QA — Core System | High |
| Additional automated tests for face-match/anomaly logic | Tester/QA — Recognition & Anomaly Module | High |
| GitHub repo setup, collaborator access, branch protection | Version Control & Documentation Lead | High |

## Definition of done (for this sprint)

- Every listed task has an open Pull Request into `dev`
- Each PR has been reviewed by at least one other team member
- `npm test` still passes after every merge
- The app still runs end-to-end via `npm start` after every merge

## Standing meeting

Weekly, 30 minutes. Each person answers: what did you finish, what are
you working on next, what's blocking you.

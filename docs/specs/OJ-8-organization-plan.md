# OJ-8: Organization plan for the pilot

Status: approved (Htet Oo Naing, 2026-11-08)
Owner: Htet Oo Naing (build), Cường Lê (review, pilot)
Risky area: yes (identity, class management used by assessment/judging/integrity/community, catalog sharing, AI access)

## Outcome

A center or school uses Online Judge as one organization: the administrator creates it with teacher seats, its org
admins bring in teachers, and everything the teachers do for the organization (classes, students, sessions,
results, submissions, shared problems) belongs to the organization, which its org admins can see and manage. A
teacher can work for several organizations and still keep personal classes. Target: end of week 2026-11-20; the
pilot runs 1–2 weeks before 2026-12-09. Decisions by the owner (2026-11-08): organization plan before contest mode;
teachers may be in several organizations; org admins view and manage; on leaving, classes stay with the
organization and problems stay with the teacher (the organization keeps copies of the ones shared with it).

## Scope

In:
1. **Organization** (administrator creates, edits, lists): name, teacher seats, active-until date, AI included.
   The administrator names the first org admin (any teacher).
2. **Membership** (many-to-many): a teacher can belong to several organizations, in each as `ADMIN` (org admin)
   or `TEACHER`; each membership takes a seat in that organization. Students are never members.
3. **Seats**: members + pending invitations ≤ seats, checked and written in one transaction. Seats cannot be set
   below what is in use.
4. **Invitations** (org admin or administrator), by email:
   - new email: the existing teacher invitation (email + code) creates the account and the membership;
   - email of an existing teacher: the invitation shows on their home page ("Lời mời vào tổ chức") to accept or
     decline, with a notification email; joining needs their acceptance;
   - email of a student or administrator account: refused (`organization.not_a_teacher`).
   Cancelling or declining frees the seat. Org admins can promote/demote members; an organization always keeps at
   least one org admin.
5. **Organization-owned classes**: a class belongs to one organization or to nobody (personal). A teacher chooses
   when creating a class (their organizations or "Cá nhân") and may move a personal class into one of their
   organizations; moving a class out of an organization is not possible in the pilot.
6. **Org admins manage the organization's classes** as the class teacher does: roster, join requests, sessions,
   results, submissions and code, rejudge, integrity flags, class board, archive. This comes from one rule:
   `Classroom.isManagedBy` = administrator, the class teacher, or an org admin of the class's organization; and
   `managedClassIds` includes those classes. The "Tổ chức của tôi" page lists, per organization: seats, active-until,
   members, invitations, classes (opening a class goes to the normal class page).
7. **Sharing with organizations** for problems, next to private and public: the owner picks which of their
   organizations see it. Teachers of those organizations see it in full (statement, tests, solution) and can copy
   it; as with public problems, a copy is what goes into their sets and sessions. Others get "not found". Bank scope
   "Tổ chức" with an organization filter.
8. **AI access** = administrator, or VIP teacher, or member of at least one organization that is active
   (today ≤ active-until) with AI included. Checked on every call (as now).
9. **Expiry**: after active-until, AI from that organization stops and no new invitations are possible; classes,
   management, sharing and data keep working. Nothing is deleted.
10. **Leaving** an organization (removed by an org admin or the administrator, or the teacher leaves):
    - the teacher keeps all their problems; problems shared with that organization stop being shared with it,
      and a copy of each goes into the bank of the org admin who removed them (when the teacher leaves or the
      administrator removes them: the longest-standing org admin), marked "copied from";
    - the organization's classes taught by the teacher stay in the organization; the same org admin becomes the
      teacher in charge and can hand a class to another member;
    - the seat is freed; other organizations and personal classes are unaffected.

Out (later): sharing problem *sets* with organizations; payment, invoices, usage limits; organization reports;
moving a class out of an organization; contest mode (bulk student accounts, anonymous scoreboard).

## Done when

- [ ] Admin: `POST/GET/PUT /organizations`, members and org admins; the Users page shows each teacher's organizations.
- [ ] Org admin: `GET /organizations` (own), `GET /organizations/:id`, invitations (create, cancel), members (remove,
      promote/demote), `GET /organizations/:id/classes`; existing teacher: `GET /organization-invitations/mine`,
      accept, decline, leave (`DELETE /organizations/:id/members/<own id>`).
- [ ] Invite beyond seats: 409 `organization.no_seats`; after active-until: 409 `organization.inactive`.
- [ ] An org admin opens, edits and manages (sessions, results, rejudge, flags) a class of their organization taught
      by another teacher; for a class of another organization or a personal class they get 404/403 as today.
- [ ] A teacher in organizations A and B: A's org admin sees only the teacher's A classes and A-shared problems.
- [ ] Organization sharing: visible to members of the chosen organizations, 404 for everyone else, students included.
- [ ] Non-VIP member of an active organization with AI included can use AI; after active-until: 403 `ai.vip_required`.
- [ ] Leaving: seat freed, organization classes reassigned to the org admin, shared problems unshared from that
      organization with copies in the org admin's bank.
- [ ] `pnpm build:shared && pnpm typecheck && pnpm test` pass; `docs/API.md` and `README.md` updated.

## Contexts and contracts

- **identity**: `Organization` aggregate, `Membership` (org, user, role, joinedAt), `OrganizationInvitation` (org,
  email, status; new-account invitations reuse the `INVITE_TEACHER` verification with `organizationId` in the
  payload), `OrganizationService` and controllers, `UserAiAccess` rule. The authenticator adds
  `organizations: { id, role }[]` to `Actor`. Events: `identity.member-left-organization`
  `{ userId, organizationId, successorId }`.
- **classroom**: `Classroom.organizationId`; `isManagedBy` and `managedClassIds` use `actor.organizations`; create
  and move into an organization check membership via the actor; listens to `member-left-organization` to reassign
  classes. classroom → identity as now.
- **catalog**: `Sharing.organizationIds` (subset of the owner's organizations at share time); `canView`/list scope
  use `actor.organizations`; listens to `member-left-organization` for unshare + copy. catalog → identity already exists.
- **assessment / judging / integrity / community**: no new code paths; they rely on `classes.canManage` and
  `managedClassIds`, which now include org admins. Each consumer is re-checked in the verifier step.
- **@oj/contracts**: `OrganizationDto`, `UpsertOrganizationRequest`, `OrganizationMemberDto`,
  `OrganizationInvitationDto`, `InviteToOrganizationRequest`; `UserDto.organizations`; `ClassroomDto.organization`;
  `UpsertClassroomRequest.organizationId`; `SharingDto.organizationIds`; `BankScope` + `'organization'`.
- **Database**: tables `organizations`, `organization_members` (primary key org+user), `organization_invitations`;
  columns `classes.organizationId` (nullable, indexed) and `problems.sharedOrganizationIds` (uuid[], default empty). Dev uses DB_SYNC; migration with OJ-5.
- **Docs**: `docs/API.md`, `README.md` (Vietnamese).

## Security

- `/organizations` create/edit/list: `@Roles('ADMIN')`. Org routes: `@Roles('ADMIN', 'TEACHER')`, and the
  application layer requires org-admin membership of *that* organization, taken from `actor.organizations`.
- Organization ids in requests are always checked against the actor's memberships; a teacher cannot create a class in,
  move a class into, or share a problem with an organization they do not belong to.
- One organization never sees another's classes or problems: tests cover a teacher in two organizations.
- Removal takes effect on the next request (actor rebuilt per request); no token change needed.
- Seat check + insert in one transaction; accepting an invitation re-checks expiry and seats.
- Security-verifier step before merge: every `canManage` / `managedClassIds` consumer, catalog visibility, AI access.

## Tests

- `test/organization.test.ts`: seats, expiry, at-least-one org admin, invitation states, multi-membership.
- `test/classroom.test.ts`: `isManagedBy` for org admin of the class's org, of another org, member (not admin).
- `test/sharing.test.ts`: organization visibility incl. teacher in two organizations and students.
- `test/organization-leave.test.ts`: classes reassigned, problems unshared + copied, other organization unaffected.
- `test/identity.test.ts`: new-account invitation joins the organization; existing teacher accept/decline.
- `test/wiring.test.ts`: new providers resolve.

## Rollout and risks

Order: contracts → identity → classroom management rule → catalog sharing → leave handling → frontend (admin
organizations, "Tổ chức của tôi", invitation inbox, class organization picker, sharing picker) → docs. Branch
`feat/OJ-8-organization-plan`, PR for Cường, after the pending hardening PRs. Estimate: 7–8 working days, so the
2026-11-20 target is tight; if it slips, the cut line is the existing-teacher invitation inbox (the administrator adds
existing teachers directly meanwhile). Risks: widening `isManagedBy` grants org admins every class power at once
(intended; verified per consumer); `Actor` shape change (typecheck). Roll back: revert; new columns and tables are
additive and nullable.

## Review follow-ups (2026-11-08)

Security-verifier review: no Critical or High findings. Fixed with regression tests (`test/organization.test.ts`):
M1 deleting a teacher now leaves their organizations properly (refused while they are the only org admin);
L1 rate limit on organization invitations; L2 adding a member withdraws their pending invitation and accepting never
overwrites a membership; L4 a failed invitation email no longer leaves an unusable account invitation; L5
`organizationIds` is required when sharing. M2 decided by the owner (2026-11-08: "archive only"): org admins archive and restore organization classes but
cannot delete them for good (scheduled or immediate); only the class teacher and the administrator can. Open: L3 (the last-org-admin check and duplicate invitations are not serialized under concurrent requests).

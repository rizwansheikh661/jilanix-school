# Component Inventory — Source Theme → SchoolOS Frontend

> **Status:** Analysis only. No code.
> **Purpose:** Walk every reusable UI control present in the purchased Bootstrap admin theme, classify each as **Reusable / Needs Refactoring / Not Suitable**, and name its target React Bootstrap (or library) equivalent.
> **Companion:** `THEME_ANALYSIS.md` (high-level), `PAGE_INVENTORY.md` (page-level), `UI_ARCHITECTURE.md` (stack rationale).

---

## 1. Classification key

| Verdict | Meaning |
|---|---|
| **Reusable** | Visual design carries over directly; React Bootstrap provides the same API; minimal refactoring. |
| **Needs refactoring** | Visual is right but implementation must be rebuilt (e.g., jQuery-driven, hardcoded data, no `aria-*`). |
| **Not suitable** | Drop entirely; pick a different control or library. |

---

## 2. Form controls

| Component | In theme as | Verdict | Replacement / target |
|---|---|---|---|
| Button | `.btn .btn-primary`, `.btn-outline-*`, sizes `-sm/-lg` | Reusable | `<Button variant="primary">` (React Bootstrap) |
| Icon button | `.btn .btn-icon` | Reusable | `<Button>` + `<Icon />` (Lucide) |
| Text input | `<input class="form-control">` | Reusable | `<Form.Control type="text">` |
| Textarea | `<textarea class="form-control">` | Reusable | `<Form.Control as="textarea">` |
| Number input | `<input type="number">` | Reusable | `<Form.Control type="number">` |
| Checkbox | `<input type="checkbox" class="form-check-input">` | Reusable | `<Form.Check type="checkbox">` |
| Radio | `<input type="radio" class="form-check-input">` | Reusable | `<Form.Check type="radio">` |
| Switch | `<input type="checkbox" class="form-check-input form-switch">` | Reusable | `<Form.Check type="switch">` |
| Select (single) | `<select class="form-select">` + Select2 | Needs refactoring | Native `<Form.Select>` for short lists; **React Select** for searchable / async |
| Select (multi) | Select2 multi-select | Not suitable (jQuery) | **React Select** with `isMulti` |
| Date picker | bootstrap-datetimepicker | Not suitable (jQuery) | **react-day-picker** |
| Date range picker | daterangepicker | Not suitable (jQuery) | **react-day-picker** `mode="range"` |
| Time picker | bootstrap-datetimepicker time mode | Not suitable | react-day-picker companion OR separate small time control |
| File upload | Theme has native + dropzone-like styling | Needs refactoring | **react-dropzone** + backend pre-signed upload via FileStorageService |
| Rich-text editor | Summernote | Not suitable (jQuery) | **TipTap** |
| Input group / addon | `.input-group` + `.input-group-text` | Reusable | `<InputGroup>` |
| Form layout | `.row + .col-md-*` grid | Reusable | React Bootstrap `<Row>` / `<Col>` |
| Field validation message | Inline `.invalid-feedback` | Needs refactoring | Driven by **React Hook Form** error state; same classnames |
| Form wizard / stepper | Custom CSS + jQuery | Needs refactoring | Custom React component using Bootstrap nav-tabs styling |

---

## 3. Data display

| Component | In theme as | Verdict | Replacement / target |
|---|---|---|---|
| Card | `.card .card-body .card-header` | Reusable | `<Card>` |
| Statistic / KPI tile | Custom `.card` variants with icon + delta | Reusable | Custom `<StatCard>` built on `<Card>` |
| Table (static) | `.table .table-hover .table-striped` | Reusable | `<Table>` |
| Table (sortable / filterable / paginated) | jQuery DataTables | Not suitable | **TanStack Table** (headless) + Bootstrap styling + backend cursor pagination |
| Pagination | `.pagination .page-item .page-link` | Reusable visually | Custom React component consuming backend `{ nextCursor, prevCursor }` — Bootstrap classes only |
| Avatar | `.avatar` (round image, size variants) | Reusable | Custom `<Avatar>` |
| Avatar group / stack | `.avatar-group` | Reusable | Custom `<AvatarGroup>` |
| Badge / pill | `.badge .bg-*` | Reusable | `<Badge>` |
| Status pill (Active/Inactive/Pending) | `.badge .badge-soft-*` | Reusable | `<Badge bg="..." pill>` with helper for status→color mapping |
| Progress bar | `.progress > .progress-bar` | Reusable | `<ProgressBar>` |
| Stepper / progress steps | Custom CSS | Needs refactoring | Custom React component |
| Timeline | Custom CSS, vertical and horizontal | Needs refactoring | Custom React component; data-driven |
| Activity feed | Card + list-group | Reusable | `<Card>` + `<ListGroup>` |
| Empty state | Illustration + heading + CTA | Reusable | Custom `<EmptyState>` |
| Skeleton loader | Not present | New | Add — use Bootstrap `placeholder-glow` + `placeholder` |
| Toast | Bootstrap toast | Reusable | `<Toast>` / `<ToastContainer>` |
| Snackbar / banner | `.alert .alert-*` | Reusable | `<Alert>` |

---

## 4. Navigation

| Component | In theme as | Verdict | Replacement / target |
|---|---|---|---|
| Header / top bar | `.header` with brand + search + notifications + user menu | Needs refactoring | Custom `<AppHeader>` — visual identical, RBAC-aware, dark-mode toggle |
| Sidebar | `.sidebar > .sidebar-inner > #sidebar-menu` | Needs refactoring | Custom `<AppSidebar>` — menu items derived from RBAC permissions, supports collapse |
| Mini sidebar | Hover-expand collapsed sidebar | Needs refactoring | Same `<AppSidebar>` with `data-sidebar="mini"` mode |
| Offcanvas mobile sidebar | Bootstrap offcanvas + jQuery toggle | Reusable visually | `<Offcanvas>` (React Bootstrap) |
| Breadcrumb | `.breadcrumb .breadcrumb-item` | Reusable | `<Breadcrumb>` |
| Tabs | `.nav-tabs .nav-link` + Bootstrap JS | Reusable | `<Tab.Container>` / `<Nav>` / `<Tab.Content>` |
| Pills | `.nav-pills` | Reusable | `<Nav variant="pills">` |
| Accordion | `.accordion .accordion-item` + Bootstrap JS | Reusable | `<Accordion>` |
| Dropdown menu | `.dropdown .dropdown-menu` + Bootstrap JS | Reusable | `<Dropdown>` |
| Context menu / kebab | Dropdown with three-dots | Reusable | `<Dropdown>` with custom toggle |
| Pagination control | See §3 | — | — |
| Quick-action FAB | Not consistently present | New | Optional custom component |

---

## 5. Overlays

| Component | In theme as | Verdict | Replacement / target |
|---|---|---|---|
| Modal dialog | `.modal` + Bootstrap JS | Reusable | `<Modal>` |
| Confirmation modal | Custom modal | Reusable | Custom `<ConfirmDialog>` wrapping `<Modal>` |
| Offcanvas drawer | `.offcanvas` + Bootstrap JS | Reusable | `<Offcanvas>` |
| Popover | `.popover` + Bootstrap JS (jQuery) | Needs refactoring | `<OverlayTrigger>` + `<Popover>` |
| Tooltip | `data-bs-toggle="tooltip"` + Bootstrap JS | Needs refactoring | `<OverlayTrigger>` + `<Tooltip>` |
| Lightbox / image viewer | jQuery plugin | Not suitable | **yet-another-react-lightbox** OR drop |
| Loading spinner | `.spinner-border` | Reusable | `<Spinner>` |
| Full-page loader | Custom overlay | Reusable | Custom `<PageLoader>` |

---

## 6. Charts

| Component | In theme as | Verdict | Replacement / target |
|---|---|---|---|
| Line / area chart | ApexCharts | Needs refactoring | `react-apexcharts` (recommended) OR Recharts |
| Bar / column chart | ApexCharts | Needs refactoring | Same |
| Donut / pie | ApexCharts | Needs refactoring | Same |
| Sparkline | ApexCharts | Needs refactoring | Same |
| Radial bar | ApexCharts | Needs refactoring | Same |
| Heatmap | ApexCharts | Needs refactoring | Same |
| Gauge | Not present | New | ApexCharts radialBar OR custom SVG |

Decision: keep ApexCharts via its official React adapter. Same visual output, no jQuery.

---

## 7. Calendar & scheduling

| Component | In theme as | Verdict | Replacement / target |
|---|---|---|---|
| Calendar (month/week/day) | FullCalendar (jQuery) | Needs refactoring | `@fullcalendar/react` |
| Event creation modal | Theme stub | Needs refactoring | `<Modal>` + form |
| Mini calendar / date picker | datetimepicker | Not suitable | react-day-picker |

---

## 8. Specialised / domain

| Component | In theme as | Verdict | Replacement / target |
|---|---|---|---|
| Chat / messaging UI | Static HTML + jQuery helpers in script.js | Needs refactoring | Custom React; back-end is Communication Center foundation |
| Kanban board | Static HTML | Needs refactoring | Custom React + `@dnd-kit` for drag-and-drop (if needed) |
| File browser / gallery | Static HTML | Needs refactoring | Custom React backed by FileStorageService |
| OTP input | Custom jQuery handler in script.js | Needs refactoring | **input-otp** React library OR small custom hook |
| Search box (header) | Native input + custom dropdown | Needs refactoring | Custom React combobox; backend search endpoint |
| Filter panel | Static HTML | Needs refactoring | Custom React, controlled inputs |
| Notification bell + drawer | Dropdown menu | Needs refactoring | Custom React; backend notification preferences + recent events |
| Theme customizer | `theme-script.js` offcanvas | Not suitable | **Discard** — collapse to dark/light toggle only |

---

## 9. New components (not in theme, required by SchoolOS)

These do not exist in the source theme and must be built fresh:

| Component | Reason |
|---|---|
| `<PermissionGate>` | Wrap subtrees, hide if RBAC permission absent |
| `<TenantSwitcher>` | Super-admin only — switch active school context |
| `<ImpersonationBanner>` | Visible bar when an operator is impersonating a school user |
| `<AuditTrailDrawer>` | Shows audit entries for the row in view |
| `<FeatureFlagBoundary>` | Hide subtree if backend flag is disabled |
| `<IfMatchForm>` | Wraps React Hook Form; sends `If-Match: <version>` on PATCH; surfaces 412 conflicts |
| `<CursorPaginator>` | Consumes backend `{ nextCursor, prevCursor, hasMore }` |
| `<ErrorEnvelopeToast>` | Renders backend standardised error envelopes |
| `<TraceIdFooter>` | Tiny footer showing `X-Trace-Id` of last failed request for support |
| `<SkipToContent>` | Accessibility — first focusable in DOM |

---

## 10. Component count by verdict

| Verdict | Count |
|---|---|
| Reusable | 26 |
| Needs refactoring | 27 |
| Not suitable | 7 |
| New (SchoolOS-specific) | 10 |

---

## 11. Naming convention going forward

- All custom components live under `apps/web/src/components/`.
- Foundational (used everywhere): `components/foundation/` — Button wrappers, Card variants, AppHeader, AppSidebar.
- Form helpers: `components/form/` — IfMatchForm, FieldArrayRow, FileDropzone.
- Domain components: `components/{student,parent,fees,timetable,...}/` — colocate with route module.

Naming: `PascalCase.tsx` files, default-export the component, named-export its props type.

---

## 12. Stop

This inventory is the basis for component build-out in Sprints F2 onward (see `FRONTEND_SPRINT_PLAN.md`). No implementation begins here.

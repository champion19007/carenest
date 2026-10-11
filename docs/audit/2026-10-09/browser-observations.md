# Browser audit observations

Date: 9 October 2026, India time. Source revision: `3b26c49`. Local production-mode website, anonymous session. Observations are read-only except navigation/search-filter UI state. No booking, support case, payment, login, consent or cloud resource was created.

| Check | Observation |
| --- | --- |
| Homepage | Cohesive blue/white desktop hero, search by query/area, doctor and pet entry paths. Sample profile labels and no-review states are visible. |
| Fractional pagination | `/search?page=1.01` shows “This page couldn't load”, “A server error occurred. Reload to try again.” Anonymous HTTP check independently returned 500. |
| Filter reset | From `/search?q=fever&area=410210&video=1`, pressing Clear all navigated to `/search`; complaint and area disappeared as well as the filter. |
| Veterinary listing | Species, video and home filters; three labelled sample providers visible. No location search or pagination in current form. |
| Veterinary profile | Dr. Neha Kulkarni displays sample disclosure, registration-listed icon, fee, clinic, IST availability and review invitation. DOM JSON-LD type is `Physician`. |
| Booking promise | Anonymous profile footer says “You will be asked to sign in to confirm the slot.” Source booking service actually creates a requested reservation requiring clinic confirmation. |
| Contact page | Anonymous visitor sees Subject/Details/Create support case and an explicit notice that no operator identity or staffed helpline is supplied. Source submit action requires a signed-in account. No submission was attempted. |
| Responsive limitation | Requested 390x844 override did not affect DOM viewport: innerWidth remained 1280. This audit therefore makes no fresh phone-layout or real-device pass claim. Historical responsive evidence is elsewhere in the repository. |
| Dependency evidence | Current website audit: 0 reported vulnerabilities. Separate mobile tree: 15 high-severity package findings. |

No screenshots of account/clinical information were saved or included. Desktop screenshots were reviewed in-session. Specific source-only findings and untested scenarios are marked in the main report.

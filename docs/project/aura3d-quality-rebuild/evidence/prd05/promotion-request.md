# A3D_QR_ASSETS promotion request (05-PROMO): not yet filed

Status: **NOT REQUESTABLE**. This is a checklist skeleton with no claims. Lane 15 (G5) is the only writer of flag state
(`dev → standalone-accepted`), at a checkpoint. Lane 05 files the request only once every box below cites a main run.

- [ ] Track 0 exit met (PRD-16 §2.5). Blocked: #375.
- [ ] Every lane-05 S-row (S1–S11) green in **one** set of lane-workflow runs on main (GitHub macos-14, `--strict`, no masks).
      Main runs needed: `qr-prd05-assets-browser.yml`, `qr-prd05-gates.yml`, `asset-optimize.yml`, `asset-lookdev.yml`.
- [ ] Sentinel identity check passes with `qr_flags=none` (ΔE2000 p99 ≤ the IC-0 noise floor).
- [ ] F-05-01..09 are `verified` with run ids (CONTRACTS Appendix B, G5 writes).
- [ ] checklist-lint green on main for PRD-05 (every `[x]` carries `run:<id>`).
- [ ] Every outbound request is filed (`q-issues.md`: one issue per section).
- [ ] The issues blocking other lanes are closed: #51 and #52 (lane 12), #68 (lane 14).
- [ ] `A3D_QR_ASSETS_LOOKDEV` is registered in the CONTRACTS §5 flag table (#540, G5) or removed.
- [ ] No open #156 (systemic browser timeouts), per the brief's blocking list.

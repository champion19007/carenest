import test from 'node:test'
import assert from 'node:assert/strict'
import {workspaceCsv} from '../lib/workspace-csv.ts'
test('CSV export quotes cells, retains paise and neutralises spreadsheet formula injection',()=>{const text=workspaceCsv([['Patient','Amount paise'],['=HYPERLINK("bad")','1235'],[' Name,quoted','1250'],['\n@SUM(1)','0']]);assert.ok(text.startsWith('\uFEFF'));assert.ok(text.includes('"\'=HYPERLINK(""bad"")"'));assert.ok(text.includes('"1235"'));assert.ok(text.includes('" Name,quoted"'));assert.ok(text.includes('"\'\n@SUM(1)"'))})

import {shiftCalendarDay} from '../lib/practice-calendar.ts'
test('month navigation clamps dates and advances across leap years and year boundaries',()=>{assert.equal(shiftCalendarDay('2028-02-01','month',1),'2028-03-01');assert.equal(shiftCalendarDay('2028-01-31','month',1),'2028-02-29');assert.equal(shiftCalendarDay('2026-12-31','month',1),'2027-01-31');assert.equal(shiftCalendarDay('2026-01-01','week',-1),'2025-12-25')})

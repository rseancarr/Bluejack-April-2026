# /samples

Put accounting's monthly workbook here (e.g. `samples/monthly-accounting.xlsx`) and
brand assets in `samples/brand/` (logo SVG/PNG, brand guide PDF).

Neither was available when v1 was built. The parser in `lib/import/parser.ts` was
written against the PROVISIONAL layout documented in `lib/import/schema.ts`; the
seed writes two demo workbooks in that layout to `storage/imports/demo/` so you can
see the expected shape.

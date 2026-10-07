# Expenser

Sort the expenses in your bank and credit card CSV exports into IRS tax
categories, plus categories you make up yourself, then export totals by tax
line.

Expenser is a static web app. It runs entirely in your browser and is hosted on
GitHub Pages. Your transactions are stored in the browser (IndexedDB) and are
never uploaded anywhere, including GitHub.

## What it does

- **Imports CSVs** from most US banks and cards. It finds the date,
  description and amount columns on its own (including separate debit/credit
  columns and summary lines above the header). It detects whether spending
  shows as negative or positive, and lets you correct anything it got wrong
  before importing. Re-importing an overlapping export skips rows you already
  have.
- **Imports PDF statements** too, read in the browser with pdf.js. It picks
  out lines that start with a date and end with an amount, fills in the year
  when the statement leaves it out (December dates on a January statement go
  to the previous year), and uses running balances to tell deposits from
  withdrawals. Every row is shown before import so you can untick anything
  that isn't a transaction. Scanned (image-only) PDFs have no text to read;
  use the bank's CSV download for those. CSV is still the most reliable
  format.
- **Built-in tax categories:**
  - Schedule C (business expenses), lines 8–30 plus cost of goods sold, with
    meals at 50%.
  - Schedule A (itemized deductions): medical, state and local taxes, mortgage
    interest, charity and more.
  - "Personal", "Transfer or card payment" and "Income" for everything else.
- **Your own categories.** Give each one a name, an optional IRS line it counts
  toward, a deductible percentage, and keywords. For example, "Music gear"
  counting toward Schedule C line 22, or "Kids' activities" with no tax line,
  just for tracking. Built-in categories you don't need can be hidden.
- **Review queue with suggestions.** Each uncategorized transaction gets a
  suggestion, accepted with one click. Suggestions come first from what you
  picked for that merchant before, then from keywords. You can filter, search,
  group by merchant, bulk-assign, accept all suggestions, and add notes such as
  the business purpose of a meal.
- **Summary by tax year.** Totals by form and line, with custom categories
  rolled into the line they count toward. Export to CSV for your preparer.
- **Backup and restore** as a JSON file. Use it to keep a copy or to move
  between computers.

## Using it

1. Download transactions as CSV (or a PDF statement) from your bank or card's website.
2. **Import**: drop the files in, check the preview, and click Import. Use the
   same account name each time for the same card so duplicates are caught.
   Click "Try sample data" to try it out without real data.
3. **Review**: pick a category for each transaction, or accept the suggestion.
4. **Categories**: add your own categories, or hide ones you don't use.
5. **Summary**: check totals for the tax year and download CSVs.
6. **Backup**: download a backup from time to time. Data lives only in the
   browser you used, and clearing site data deletes it.

> Expenser is a bookkeeping aid, not tax advice. Totals are before limits
> applied on the return (the 7.5%-of-AGI medical floor, the state and local
> tax cap, depreciation rules and so on). Check with a tax professional.

## Publishing on GitHub Pages

The workflow in `.github/workflows/deploy.yml` lints, tests and builds every
push. On the repository's default branch it also deploys the site to Pages.

One-time setup: in the repository on GitHub, open **Settings → Pages** and set
**Source** to **GitHub Actions**. The next push to the default branch (or a
manual run of the workflow from the Actions tab) publishes the site at
`https://<your-username>.github.io/expenser/`.

The build uses relative asset paths and hash-based URLs (`#/review`), so it works
under any repository name without configuration.

## Development

Requires Node.js 22 or newer.

```bash
npm install
npm run dev       # local dev server
npm test          # unit tests (Vitest)
npm run lint      # oxlint
npm run build     # type-check and build into dist/
npm run preview   # serve the production build
```

### Layout

| Path | What's there |
| --- | --- |
| `src/lib/csv.ts` | CSV reading, column detection, amount/date parsing, sign handling |
| `src/lib/pdfText.ts`, `src/lib/statement.ts` | PDF text extraction and statement-line parsing |
| `src/lib/taxCategories.ts` | Built-in Schedule C / Schedule A categories and keywords |
| `src/lib/suggest.ts` | Merchant normalization and suggestions (past picks, then keywords) |
| `src/lib/db.ts` | IndexedDB storage (Dexie): import with de-duplication, categorizing, backup |
| `src/lib/summary.ts` | Totals by tax line, including custom-category roll-ups |
| `src/lib/export.ts` | CSV exports |
| `src/views/` | The Import, Review, Categories, Summary and Backup screens |
| `public/sample-transactions.csv` | Sample data used by "Try sample data" |

## Credits

Started from the official [Vite](https://vite.dev) React + TypeScript template.
The CSV parsing rules and the starting Schedule C keyword lists are ported from
[realtonkaa/smart-expense-categorizer](https://github.com/realtonkaa/smart-expense-categorizer)
(MIT). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

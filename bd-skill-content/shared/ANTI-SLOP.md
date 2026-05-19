# ANTI-SLOP: Writing voice and pattern bans

Mandatory before generating any user-facing prose. Applies to post bodies, FAQ, meta descriptions, titles, anchor text, attribution.

## Voice target

Friend telling someone about a cool local thing. Generous with specifics, no padding, no press-release tone. Name specific things. Trust the reader. Vary sentence length. Link generously.

## Banned

| Pattern | Examples / fix |
|---|---|
| En-dash (`–`, U+2013) and em-dash (`—`, U+2014) | Use commas, periods, parens, or "to" for ranges. Banned everywhere. |
| Smart-punctuation drift | Curly single quotes (`'` `'`, U+2018/2019), curly double quotes (`"` `"`, U+201C/201D), ellipsis (`…`, U+2026), non-breaking space (U+00A0). Use straight `'`, straight `"`, three periods `...`, regular space. Auto-inserted by the model, near-perfect AI tell alongside em-dash. |
| Tricolon / forced triples | "X, Y, and Z" parallel stacks invented for rhythm ("welcoming, energizing, and unforgettable"). Use only when the content genuinely has three items. Never invent a third for cadence. |
| "Not just X, it's Y" amplifier | "It's not just a race, it's a community", "more than just a conference", "isn't merely a workshop" → state Y directly. Distinct from negative listing — this is the additive escalator. |
| Participial/gerund openers | "Standing in the lobby...", "Looking ahead...", "Bringing together...", "Drawing on decades of experience..." Max one `-ing` participial opener per section. "Looking ahead", "Bringing together", "Drawing on" banned outright. |
| Conclusion-recap reflex | "In short", "In summary", "Ultimately", "The takeaway", "What this means", "All told", "At the end of the day" as section/post closers. Conclusions advance — give the reader the next thing to do, not a restatement. |
| Throat-clearing openers | "Here's the thing/what/why", "It turns out", "The truth is", "Let me be clear", "What you need to know" → cut, state the point |
| Binary contrasts / negative listing | "Not X. Y." / "isn't X, it's Y" / "Not a concert. Not a conference. It's Z." → just say Y |
| Dramatic fragmentation | "Two days. Two stages. That's it." → combine into a real sentence |
| Rhetorical setups | "What if I told you...", "Think about it:", "Here's what I mean:", Wh- sentence-starters in prose → restructure. **Exempt: FAQ question labels** ("When is...?", "Where does...?", "How much...?") — those are structural Q&A, not prose openers. |
| Inanimate as actor | "decisions emerge", "data tells us", "markets reward", "culture shifts" → name the human |
| Passive voice | "was created", "is believed", "mistakes were made" → name the actor |
| Adverb crutches | really, just, literally, genuinely, honestly, simply, actually, deeply, truly, fundamentally, inherently, inevitably, interestingly, importantly, crucially, ultimately → delete |
| Business jargon | navigate, unpack, lean into, deep dive, double down, circle back, take a step back, moving forward, at its core, at the end of the day, when it comes to, in today's landscape, game-changer → plain language |
| Vocabulary fingerprints | delve, showcase, leverage, harness, elevate, empower, unlock, foster, vibrant, bustling, stunning, breathtaking, nestled, rich tapestry, treasure trove → replace with a concrete verb or adjective tied to the specific subject. Highest-signal single-word AI tells in 2026 detectors. |
| Scene-setting openers | "Picture this:", "Imagine", "It's a crisp morning in...", "The smell of [X] fills the air..." → state the article's subject directly. No asking the reader to visualize before getting to the point. |
| Performative emphasis | "Let that sink in", "Make no mistake", "Full stop", "Period.", "And that's okay" → cut |
| Vague declaratives | "significant", "important", "the implications are", "the stakes are" without naming the specific thing → name it |
| Telling not showing | "this is incredibly difficult", "this is what leadership looks like" → demonstrate with specifics |
| Fabricated authority | "studies show", "experts agree", "research suggests" without citation → cite or rewrite as opinion |
| Lazy extremes | every, always, never, everyone, nobody without specifics → use real numbers or "most"/"many"/"few" |

## Self-check before posting

1. Any `–` (U+2013) or `—` (U+2014) outside code? Rewrite.
1a. Any curly quote (U+2018/2019/201C/201D), ellipsis (U+2026), or NBSP (U+00A0) outside code? Replace with straight ASCII.
2. Throat-clearing opener? Cut.
3. "Not X, it's Y" / negative listing / "not just X, it's Y" amplifier? State Y.
3a. Invented tricolon ("X, Y, and Z" with no real third item)? Drop the third or rewrite.
3b. `-ing` participial opener — more than one per section, or any of the banned three ("Looking ahead", "Bringing together", "Drawing on")? Restructure.
3c. Conclusion or section closer that recaps ("In short", "Ultimately", "The takeaway", etc.)? Replace with a next-step or a fresh specific.
4. Banned adverb / jargon / vocabulary fingerprint (delve/showcase/leverage/nestled/vibrant/bustling/tapestry/etc.)? Delete or replace with a concrete subject-specific word.
4a. Scene-setting opener ("Picture this", "Imagine", "It's a [adjective] [time]...")? Cut, state the subject directly.
5. Passive voice? Name the actor.
6. Inanimate-as-actor? Name the person.
7. Vague declarative? Name the specific.
8. Stacked fragments? Combine.
9. Performative emphasis? Cut.
10. Three same-length sentences in a row? Vary one.
11. Unsourced authority claim? Cite or rewrite.
12. Lazy extreme? Add specifics.
13. Wh- sentence opener in prose? Restructure. (FAQ question labels exempt.)
14. Paragraph rhythm: 2-4 paragraphs between H2/H3 headings, 3-6 sentences each, varied — not metronomic. Back-to-back larger paragraphs encouraged when content supports it; asymmetrical sizing reads more human than uniform blocks.
15. **Bullets rule.** Bullets used as a default structure or to break up every section? Cut. Use a short bulleted/numbered list only when content is genuinely parallel and scannable (specs, steps, options, criteria). One or two lists per post, max. Prose is primary; bullets are a tool, not a layout.

## Scoring (rate 1-10, ship if ≥40/50)

| Dimension | Question |
|---|---|
| Directness | Statements or announcements? |
| Rhythm | Varied sentence length, or metronomic? |
| Trust | Respects reader intelligence, no over-explaining? |
| Authenticity | Sounds human-typed? |
| Density | Padding cut, substance kept? A short shallow post fails this — depth from specifics, examples, and useful context is not padding. |

## Drift triggers (stop and rewrite)

Wh- sentence-starter in prose (FAQ labels exempt). Hedging every claim. Explaining what you're about to say. Padding when data doesn't support length. Three "and"s in one sentence.

## Wrong-example reference

The code block in this section contains the banned U+2014 character — included so you can recognize the pattern. Do NOT write text like this:

```
Tickets cost $20—$45 for the Saturday show — bring sunscreen.
```

Right:

```
Tickets cost $20 to $45 for the Saturday show. Bring sunscreen.
```

## Scope

Prose only. See `METHODOLOGY.md` (research/gates/dedup/hard-rules), `URL-PATTERNS.md` (links).

# Architecture-diagram design notes &amp; sources

The slide diagram ([`deal-room-architecture-slide.html`](./deal-room-architecture-slide.html) / `.png`, fixed **1280×720** for decks) was rebuilt from established diagramming guidance rather than by eye. This note records the principles applied and the sources they came from.

## Principles applied (and where each came from)

| # | Principle applied in the diagram | Source(s) |
|---|---|---|
| 1 | **Hub-and-spoke / centered-containment layout** — the Container Apps core sits center-stage with domains radiating out (channels above, identity left, AI right, data below, external &amp; observe in the corners). Flow is **multi-directional**, as most real architecture diagrams are — not a single-direction pipeline | Azure WAF Design Diagrams; draw.io "logical blocks"; NNG *Common Region* |
| 2 | **Common-region zones** — each domain is a shaded, labeled bounding box so membership is unambiguous | NNG *Common Region*; NNG *Proximity*; draw.io "logical blocks" |
| 3 | **One consistent shape/size per node type**; colour rail encodes tier, not decoration | NNG *Similarity*; Azure WAF ("consistent colours/icon sizes") |
| 4 | **Orthogonal, single-ended, labeled connectors**; no bidirectional arrows | C4 Notation; Azure WAF; Structurizr |
| 5 | **Minimise line crossings** — a vertical *data bus* with short taps replaces a 5-line "curtain" | IDF *Law of Continuity*; graph-drawing practice |
| 6 | **Label edges with intent** (HTTPS, MCP, reads · docs · events, archive, Graph, telemetry), not "uses" | C4 Notation; Balosin (InfoQ) |
| 7 | **A legend/key** distinguishing solid (data/call flow) vs dashed (identity · secrets · telemetry) | C4 Notation; Azure WAF; Structurizr |
| 8 | **Exactly three type sizes** (title / node label / edge label) | NNG *Visual Hierarchy* |
| 9 | **One clear focal point** (the Container Apps hub) — passes the "squint test" | NNG *Visual Hierarchy* |
| 10 | **Limited palette**; colour carries meaning (tier), paired with position — not sole distinguisher | NNG *Visual Hierarchy*; Azure WAF (accessibility) |
| 11 | **Remove chartjunk** — flat cards, no 3-D/heavy gradients; maximise data-ink | Tufte (*Chartjunk* / data-ink) |
| 12 | **Whitespace is structural** — even node distribution, generous gutters between zones | IDF *Building Blocks of Visual Design* |
| 13 | **Layer, don't overload** — a map-level abstraction; detail lives in the full reference diagram | C4 FAQ; Azure WAF; Balosin |
| 14 | **Official Azure icons, unmodified**, each paired with a product name | Azure Architecture Icons; Azure WAF |
| 15 | **High-contrast labels** on shaded backgrounds for legibility | NNG *Low Contrast* |

## Sources (19 cited)

1. C4 Model — Notation (Simon Brown) — https://c4model.com/diagrams/notation — every diagram needs a title + legend; every line unidirectional and labeled with intent; consistent colour coding.
2. C4 Model — Abstractions — https://c4model.com/abstractions — "maps of your code"; one abstraction level per diagram; context + container levels suffice for most.
3. C4 Model — FAQ (cognitive load) — https://c4model.com/faq — large diagrams overload; split rather than overload; one story per diagram.
4. Simon Brown — InfoQ: *The C4 Model for Software Architecture* — https://www.infoq.com/articles/C4-architecture-model/ — most diagrams are "a confused mess of boxes and lines"; add name + type + description; always a legend + title.
5. Ionut Balosin — InfoQ: *The Art of Crafting Architectural Diagrams* — https://www.infoq.com/articles/crafting-architectural-diagrams/ — if it raises more questions than answers it is bad; simple consistent colours; one abstraction level; don't mix runtime + static.
6. Microsoft Azure Well-Architected — *Create Architecture Design Diagrams* — https://learn.microsoft.com/en-us/azure/well-architected/architect-role/design-diagrams — single-ended directional arrows; label everything; consistent colours/icon sizes/line weights; provide a legend; layer, don't overload; use latest official icons, don't recolor/stretch.
7. Structurizr — Notation — https://docs.structurizr.com/ui/diagrams/notation — bidirectional arrows are ambiguous; shapes add information; auto-generated key/legend.
8. Microsoft Azure Architecture Icons — https://learn.microsoft.com/en-us/azure/architecture/icons/ — official icon set; keep proportions; pair icon with product name; don't modify brand shapes.
9. draw.io — Azure diagrams guide — https://www.drawio.com/docs/diagram-types/azure-diagrams/ — draw in logical blocks; dashed/coloured background rectangles (sent to back) to group zones without obscuring shapes.
10. draw.io — Network diagrams guide — https://www.drawio.com/docs/diagram-types/network-diagrams/ — symbols/shapes/colours indicate types + groups; connectors indicate communication; group by one dimension per layer.
11. NNG — Gestalt Proximity — https://www.nngroup.com/articles/gestalt-proximity/ — items close together are perceived as a group; use whitespace to separate tiers.
12. NNG — Common Region — https://www.nngroup.com/articles/common-region/ — a shared boundary groups items even against proximity; use shaded boxes for tiers/zones.
13. NNG — Gestalt Similarity — https://www.nngroup.com/articles/gestalt-similarity/ — same visual characteristic = perceived same type; never reuse a shape/colour for two meanings.
14. NNG — Visual Hierarchy — https://www.nngroup.com/articles/visual-hierarchy-ux-definition/ — no more than 3 sizes; limited palette; "squint test" — only the most important element readable when blurred.
15. NNG — Minimize Cognitive Load — https://www.nngroup.com/articles/minimize-cognitive-load/ — avoid visual clutter; every element must carry meaning.
16. IDF — Building Blocks of Visual Design — https://ixdf.org/literature/article/the-building-blocks-of-visual-design — negative/white space is structural; line properties carry meaning (dashed = optional, thick = primary).
17. IDF — Law of Continuity — https://ixdf.org/literature/topics/law-of-continuity — the eye follows smooth continuous paths; line crossings break continuity — route to avoid crossings.
18. Edward Tufte — Chartjunk / data-ink — https://en.wikipedia.org/wiki/Chartjunk — remove decorative fills, 3-D, gradients; maximise data-ink.
19. NNG — Low Contrast — https://www.nngroup.com/articles/low-contrast/ — insufficient text/background contrast degrades legibility; shaded regions must still allow readable labels.

## What changed across iterations

- **v1 (rejected)** — curved bezier connectors crossed each other (a "confused mess of boxes and lines" — violating the Law of Continuity), tiers had dead whitespace, edges were unlabeled and there was no legend.
- **v2 (rejected)** — fixed the connectors, zones and legend, but used a **strict left→right column pipeline**. That reads like a flowchart, not an architecture map; real architecture diagrams are rarely a single-direction pipeline.
- **v3 (current)** — a **hub-and-spoke / centered-containment** layout: the Container Apps core is central, with domains grouped around it and connectors radiating in all directions (north to channels, west to identity, east to AI, south to a data bus, and to the external/observability corners). A single grouped spoke to the External · M365 zone and a short telemetry chain in the Observe corner keep the periphery clean. This matches how Azure reference architectures are actually drawn, while still honoring the notation/visual rules above (grouping, labeled single-ended connectors, a legend, a 3-size type scale, one focal hub, minimal crossings, flat cards).

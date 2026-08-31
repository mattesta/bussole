# Bussole!

A mobile geography game: aim your phone towards a target, draw a great-circle
route and see how close you get.

The game runs as a static site on GitHub Pages:
<https://mattesta.github.io/bussole/>

## Random targets

`targets.js` contains the catalogue used by the **Random / Skip** control. It is
generated from Wikidata and English Wikipedia and balances three categories:
capitals and territorial administrative centres, internationally familiar
cities, and iconic places. Selection weights favour familiar entries without
excluding the catalogue's long tail.

To refresh the catalogue:

```sh
python scripts/build_targets.py
```

The build validates coordinates, unique identifiers, category coverage and the
presence of remote territories such as the Pitcairn Islands.

Location data is derived from [Wikidata](https://www.wikidata.org/) (CC0) and
[Wikipedia](https://www.wikipedia.org/).

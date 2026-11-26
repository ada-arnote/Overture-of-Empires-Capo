# Notices

Overture of Empires: Capo is free software under the GNU Affero General Public License, version 3 or later. The text is in LICENSE.

Nothing from another project has been copied into this project yet. When something is, its notice goes here and its file goes in ADAPTED.csv.

Each font, icon, picture or sound from elsewhere has a row in CREDITS.csv and a line here naming its file or folder; a font's licence text and copyright line sit beside it in a .txt, and an MIT or ISC set keeps its copyright line and permission text here.

Fonts, each under the SIL Open Font License 1.1, with the licence text and copyright line in an OFL.txt beside the files:
- site/fonts/tent-roman/: Tent Roman, a subset of IM FELL English Roman by Igino Marini, renamed because the original declares the Reserved Font Name "IM FELL English Roman". Copyright 2007 Igino Marini.
- site/fonts/spectral/: Spectral Regular. Copyright 2017 The Spectral Project Authors.
- site/fonts/atkinson/: Atkinson Hyperlegible Regular and Bold. Copyright 2020 Braille Institute of America, Inc.

The coast in src/games/maps/world.js is drawn from Natural Earth (1:50m land, version 4.1.0), which is in the public domain. Made with Natural Earth. The provinces, their names and their borders are our own.

The provinces in maps/world.json, the world map for Capo's story worlds, are drawn from Natural Earth (1:10m admin-1 states and provinces, version 5.1.1), which is in the public domain. Made with Natural Earth. Small provinces are merged and every line is simplified by tools/provinces.py; the names and codes are the source's own.

The world coast in site/icons/world/coast.svg, the chart lines behind Capo on the front page, is drawn from the same Natural Earth provinces as maps/world.json (1:10m admin-1 states and provinces, version 5.1.1), which are in the public domain. Made with Natural Earth. Only the coast is kept, simplified for a small map.

The relief in maps/relief.webp, the heights and sea floor that light Capo's world map, is baked from ETOPO 2022 (60 arc-second ice-surface elevation; NOAA National Centers for Environmental Information, 2022, doi:10.25921/fd45-gt74). NOAA's record says: "These data were produced by NOAA and are not subject to copyright protection in the United States. NOAA waives any potential copyright and related rights in these data worldwide through the Creative Commons Zero 1.0 Universal Public Domain Dedication (CC0-1.0)." Not to be used for navigation. Its ice is from Natural Earth (1:10m glaciated areas, version 5), and the rivers and lakes in maps/waters.json are from Natural Earth (1:10m rivers with lake centre lines, and lakes, version 5), which are in the public domain. Made with Natural Earth. tools/relief.py makes both files; the data itself is not kept in this repository.

The models on the boards and on Capo's map are made in code (src/map/kit.js and src/map/models.js): our own work. A style may add a pack of sculpted models in site/models/, converted by tools/models.mjs from CC0 or public-domain models only; each pack is listed in CREDITS.csv with its source and what was changed. None ships yet.

The disputed areas in maps/disputes.json, drawn over the world map, are from Natural Earth (1:10m admin-0 disputed areas, version 5.1.1), which is in the public domain. Made with Natural Earth. The notes on who holds and who claims each area are the source's own, with its abbreviations written out.

Icons in site/icons/game-icons/ are from game-icons.net under the Creative Commons Attribution 3.0 licence (https://creativecommons.org/licenses/by/3.0/). Icons made by Delapouite (rolling-dices.svg, village.svg) and by Lorc (wheat.svg, ink-swirl.svg). Available on https://game-icons.net. We dropped their metadata and rounded their coordinates; the page sets their colour.

Icons in site/icons/phosphor/ (play.svg, link.svg) are from Phosphor Icons, version 2.0.8 (https://github.com/phosphor-icons/core), under the MIT License; coordinates rounded:

MIT License

Copyright (c) 2023 Phosphor Icons

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

The engraving in site/icons/engraved/ is in the public domain: a detail of Paul Sandby's etching "View of the Encampment in Hyde-Park from Marshal Sax's Tent" (1780; Rijksmuseum, Amsterdam, RP-P-1904-1473, Public Domain Mark). We cropped it and kept its ink as transparency.

The texture in site/textures/ is cut from a CC0 colour map: Smoked Walnut Veneer by Jenelle van Heerden (Poly Haven). No credit is required; we give it gladly.

The compass rose in site/icons/tent/ is our own drawing.

The pictures in site/shots/ are screenshots of our own game pages, taken for the front page: our own work. The map in capo.webp is drawn from Natural Earth, as above.

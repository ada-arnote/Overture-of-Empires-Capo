# Notices

Overture of Empires: Capo, made by Arnote Studios (copyright 2026 Ada Arnote), is free software under the GNU Affero General Public License, version 3 or later. The text is in LICENSE.

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

The models on the boards and on Capo's map are made in code (src/map/kit.js and src/map/models.js): our own work. In 3D, some pieces are sculpted models by other makers, converted by tools/models.mjs (CC0, public domain, or CC BY with its credit line, ruling 146); each file in site/models/ has a row in CREDITS.csv and is named below with its credit, and the same credits are in every game's About. The four Jaca museum scans are converted but not shipped (ruling 150).

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

<!-- models: written by tools/models.mjs -->
Sculpted pieces in site/models/, fetched only when a board in 3D shows them. Each is cut down, repainted in the board's palette and re-encoded by tools/models.mjs; the credits are also in every game's About.

- site/models/knight.bin: "Knight Hospitaller - 3d printable" by Andy Woodhead (https://sketchfab.com/3d-models/7975ee5c47a94d35abf98070bfdd1ea8), CC BY 4.0, modified (cut down, repainted, re-encoded). Licence: https://creativecommons.org/licenses/by/4.0/
- site/models/legionary.bin: "Roman Soldier - fighting pose - 3d printable" by Andy Woodhead (https://sketchfab.com/3d-models/5c29ca5803ad475eaaae12714e8f1dab), CC BY 4.0, modified (cut down, repainted, re-encoded). Licence: https://creativecommons.org/licenses/by/4.0/
- site/models/redcoat.bin: "Waterloo British Infantry - for animation" by Andy Woodhead (https://sketchfab.com/3d-models/85a1a8205b2c447fb8d0419978f17b75), CC BY 4.0, modified (posed, cut down, repainted, re-encoded). Licence: https://creativecommons.org/licenses/by/4.0/
- site/models/general.bin: "Roman General - 3d printable" by Andy Woodhead (https://sketchfab.com/3d-models/70d18b0518344b7bad3cd0979072a1c2), CC BY 4.0, modified (remeshed, cut down, painted as pewter, re-encoded). Licence: https://creativecommons.org/licenses/by/4.0/
- site/models/horse.bin: "Galloping Horse - free download - 3d-printable" by Andy Woodhead (https://sketchfab.com/3d-models/dfc6f5596aba48a0b08a44c31b97b368), CC BY 4.0, modified (base removed, cut down, repainted, re-encoded). Licence: https://creativecommons.org/licenses/by/4.0/
- site/models/cannon.bin: "British field cannon - 1815 - free download" by Andy Woodhead (https://sketchfab.com/3d-models/c027cb2e6e764f4196f27c94b5f770d5), CC BY 4.0, modified (low-poly version, cut down, repainted, re-encoded). Licence: https://creativecommons.org/licenses/by/4.0/
- site/models/longboat.bin: "Gislinge Viking Boat" by Opus Poly (https://sketchfab.com/3d-models/01098ad7973647a9b558f41d2ebc5193), CC BY 4.0, modified (cut down, repainted, re-encoded). Licence: https://creativecommons.org/licenses/by/4.0/
- site/models/liner.bin: "Ship of the line, c. 1700", Swedish National Maritime and Transport Museums (https://sketchfab.com/3d-models/3afea352a40045b0a638c9900f669ed4), CC BY 4.0, modified (remeshed, cut down, repainted, re-encoded). Licence: https://creativecommons.org/licenses/by/4.0/
- site/models/torpedo.bin: "Swedish 2nd class Torpedo Boat (1908)", Swedish National Maritime and Transport Museums (https://sketchfab.com/3d-models/d71822cc900b43dfa76b014c250e9e7f), CC BY 4.0, modified (remeshed, cut down, repainted, re-encoded). Licence: https://creativecommons.org/licenses/by/4.0/
- site/models/destroyer.bin: "1:1 Low poly US NAVY DDG-51 USS Arleigh Burke." by Yi Tsung Lee, model and texture by WTigerTw (https://sketchfab.com/3d-models/17be09c31c6047e4a5969b68c29eba03), CC BY 4.0, modified (cut down, repainted, re-encoded). Licence: https://creativecommons.org/licenses/by/4.0/

CC0 models, no credit needed, thanked all the same: Quaternius and Anker's Assets (site/models/cottage.bin, site/models/townhouse.bin, site/models/adobe.bin).
<!-- end of models -->

# Die Sound-Bibliothek

*[English version](sound-library.md)*

Die Sound-Bibliothek sammelt die wiederkehrenden Töne deiner Memes – denselben Boom, Record Scratch oder Sting –,
damit ein Meme sie nicht jedes Mal neu erzeugt. Sie gehört zum Workspace, liegt in `library/sounds/`, und das
Meme-Skill wählt beim Schreiben eines Scripts daraus aus ([ADR 0051](adr/0051-memes-and-the-sound-library.md)).
`coreslopper init` und `coreslopper update` fassen sie nie an.

Diese Seite beschreibt, wie du die Bibliothek von Hand pflegst. Die [Sounds-Ansicht](board.md#sounds) des Boards
macht dasselbe über dieselben Befehle.

## Wo die Bibliothek liegt

Ein Ordner pro Sound:

```
library/sounds/
  vine-boom/
    sound.yaml   der Eintrag: Titel, Wofür, Cue, Lizenz …
    sound.wav    das Audio
```

- `sound.yaml` ist in git verfolgt; er ist der Eintrag. `sound.wav` ist gitignoriert, wie die Medien der Figuren- und
  Set-Bibliothek. Ein frischer Clone hat die Beschreibungen, aber nicht das Audio: kopiere die WAVs hinein und führe
  `sound check` aus.
- Der Ordnername ist die Id des Sounds: Kleinbuchstaben, Ziffern, `-` und `_`, beginnend mit Buchstabe oder Ziffer,
  höchstens 80 Zeichen (`vine-boom`, `record-scratch-02`). `sound add` nimmt sie vom Titel, außer du gibst `--id` an.
- Die Bibliothek gehört dir. Die Meme-Stages kopieren einen Sound nur als Take in ein Meme und schreiben nie hierher;
  eigene Änderungen sind willkommen (siehe „Von Hand bearbeiten“).
- Versteckte Ordner `.incoming-*` und `.removing-*` gehören zu einem laufenden `sound add` oder `sound remove`. Sie
  sind nie Einträge; einen Rest nach einem abgebrochenen Lauf kannst du von Hand löschen.

## Der Eintrag, Feld für Feld

| Feld | Bedeutung | Geschrieben von |
|---|---|---|
| `version` | Schema-Version, immer `1`. | `sound add` |
| `id` | Der Name des Ordners. | `sound add`; bei einer Handänderung muss er der Ordnername bleiben |
| `title` | Wie der Sound heißt, bis 200 Zeichen (`Vine Boom`). | `sound add`, `sound edit`, Handänderung |
| `use_when` | Wofür der Sound in einem Meme gedacht ist, bis 1000 Zeichen. Siehe „Wofür“ unten. | `sound add`, `sound edit`, Handänderung |
| `tags` | Schlagworte zum Finden, je bis 60 Zeichen; in der Kommandozeile mit Komma getrennt. | `sound add`, `sound edit`, Handänderung |
| `length` | Die Länge der WAV in Sekunden, gemessen. | `sound add`, `sound check` |
| `loudness` | Integrierte Lautheit in LUFS, gemessen; die Datei wird nie normalisiert. | `sound add`, `sound check` |
| `cue` | Der Moment, in dem der Sound landet, in Sekunden ab dem Trim-Anfang und darin liegend. Siehe „Den Cue finden“ unten. | `sound add`, `sound edit`, Handänderung |
| `trim` | `{ start, end }` in Sekunden: der Teil der Datei, den ein Meme nutzt; `start` vor `end`, beide innerhalb von `length`. | `sound add`, `sound edit`, Handänderung |
| `source` | Woher der Sound kommt: eine URL oder freie Worte, bis 2000 Zeichen. | `sound add`, `sound edit`, Handänderung |
| `licence` | Freitext bis 200 Zeichen; `unknown`, bis du eine angibst. | `sound add`, `sound edit`, Handänderung |
| `credit` | Der Namensnennungstext, den eine Lizenz verlangt, bis 1000 Zeichen. | `sound add`, `sound edit`, Handänderung |
| `hash` | sha256 von `sound.wav`; der Take eines Memes hält fest, wovon er kopiert wurde. | `sound add`, `sound check` |
| `original_hash` | sha256 der Datei, wie du sie hinzugefügt hast, damit dieselbe Datei wiedererkannt wird, egal was der ffmpeg-Build daraus macht. Eine von dir getauschte WAV verliert ihn, wenn `sound check` die neue Datei misst. | `sound add`, `sound check` |
| `added` | Wann der Sound in die Bibliothek kam, ISO-Datum und -Zeit. | `sound add` |

Trage `length`, `loudness`, `hash`, `original_hash` und `added` nicht selbst ein: die Befehle messen und schreiben
sie. Eine Änderung über Claude Code wird beim Schreiben geprüft; alles andere findet `sound check`.

### Wofür: was der Sound bedeutet

Das Meme-Skill wählt nach `use_when`, nicht nach dem Titel. Schreibe deshalb die Situation im Meme, nicht den Klang.

- **Gut**: `Ein unerwartetes Reveal oder ein gescheiterter Plan – schneidet auf eine Reaktion und unterstreicht die Pointe.`
- **Schwach**: `Ein tiefer Boom mit Hall und Ausklang.` (wie er klingt; das Skill erkennt daraus nicht, wann er passt)

Ein bis zwei Sätze zu dem Moment, den er punktiert, reichen; die Schlagworte grenzen die Auswahl ein.

### Den Cue finden

Der Cue ist der Moment, in dem der Sound landet – der Hit –, in Sekunden ab dem **Trim-Anfang**, nicht ab dem
Dateianfang. Spiele den Sound ab, halte beim Hit an und lies die Position ab; **Cue aus Abspielposition** in der
Sounds-Ansicht des Boards macht genau das.

Bei `trim: { start: 0.20, end: 1.40 }` und dem Hit 0.55 s in der Datei ist der Cue `0.35`. Der Cue muss im
getrimmten Sound liegen (hier höchstens `1.20`). Nur ein Shot eines Memes, der auf dem `cue` der Zeile verankert ist,
nutzt ihn: der Shot landet auf dem Hit.

### Beispiel

```yaml
version: 1
id: vine-boom
title: Vine Boom
use_when: Ein unerwartetes Reveal oder ein gescheiterter Plan – schneidet auf eine Reaktion und unterstreicht die Pointe.
tags: [reveal, reaction, punchline]
length: 1.404
loudness: -18.2
cue: 0.12
trim: { start: 0, end: 1.4 }
source: https://example.com/boom.mp3
licence: CC BY 4.0
credit: Boom von Jane Doe, CC BY 4.0
hash: 4f2c0a9e8b7d6c5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d9c8b7a6f5e4d3c2b1a
original_hash: 9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b
added: '2026-11-25T09:00:00.000Z'
```

## Befehle

Führe sie im Workspace aus: `npm run cli -- sound …`.

| Befehl | Was er tut |
|---|---|
| `sound list [--tag <tag>] [--json]` | Jeder Sound nach Id sortiert, mit Wofür, Messwerten, Cue, Trim, Lizenz, Schlagworten und den Memes, die ihn übernommen haben. `--json` gibt jedes Feld für das Meme-Skill aus. |
| `sound add <file> --title <title> --use-when <text> …` | Speichert eine lokale Audiodatei als WAV und schreibt den Eintrag. |
| `sound edit <id> [--field …]` | Ändert die Metadaten des Eintrags, nie seine Datei. |
| `sound remove <id>` | Löscht den Eintrag und seine WAV. |
| `sound check` | Prüft die ganze Bibliothek nach Handänderungen und misst eine getauschte WAV neu. |

### `sound add`

```bash
npm run cli -- sound add boom.mp3 --title "Vine Boom" \
  --use-when "Ein unerwartetes Reveal – schneidet auf eine Reaktion." \
  --tags reveal,reaction --cue 0.12 --trim 0-1.4 \
  --source https://example.com/boom.mp3 --licence "CC BY 4.0" --credit "Boom von Jane Doe, CC BY 4.0"
```

- Nimmt eine lokale Datei, keine URL (lade sie vorher herunter). Jedes Format, das ffmpeg liest, funktioniert (MP3,
  WAV, M4A, FLAC, OGG, auch die Tonspur eines Videos); gespeichert wird eine 16-Bit-PCM-WAV mit 48 kHz ohne Metadaten,
  bitgenau, ohne Verstärkung und ohne Normalisierung.
- `--title` und `--use-when` sind Pflicht; `--id`, `--tags`, `--cue`, `--trim`, `--source`, `--licence` und `--credit`
  sind optional. `--trim` ist `start-ende` in Sekunden, etwa `0.1-1.2`.
- Die Lizenz ist `unknown`, bis du eine nennst. Ohne `--id` kommt die Id vom Titel.
- Abgelehnt, und die Bibliothek bleibt, wie sie war: eine vergebene Id, eine Datei, deren Inhalt schon unter einer
  anderen Id liegt (verglichen werden die gespeicherten WAVs und die Dateien, wie du sie hinzugefügt hast), eine
  Datei, die kein Audio ist oder still ist, ein Cue oder Trim außerhalb des Sounds und eine URL.
- Der Ordner erscheint erst, wenn jede Prüfung bestanden ist; Länge und Lautheit werden aus der WAV gemessen.

### `sound edit`

```bash
npm run cli -- sound edit vine-boom --use-when "Ein unerwartetes Reveal oder ein gescheiterter Plan."
npm run cli -- sound edit vine-boom --tags reveal,reaction,plan
npm run cli -- sound edit vine-boom --licence own --credit ""
```

- Ändert den Eintrag, nie die Audiodatei. Ein leerer Wert löscht ein optionales Feld; eine leere `--licence` macht
  daraus wieder `unknown`. `--tags` ersetzt die Liste.
- `title` und `use_when` bleiben gefüllt. Cue und Trim müssen im Sound bleiben.
- Ein neuer `--trim` ohne `--cue` hält den Cue auf demselben Moment der **Datei**: weil der Cue ab dem Trim-Anfang
  zählt, verschiebt er sich mit dem Trim.
- `length` und `loudness` werden gemessen und lassen sich nicht eintippen.
- Eine Änderung, die nichts ändert, schreibt nichts.

### `sound remove`

```bash
npm run cli -- sound remove vine-boom
```

Löscht den Eintrag und seine WAV. Memes, die den Sound übernommen haben, behalten ihre Kopien; der Befehl nennt sie
und erinnert daran, dass Lizenz und Credit die Bibliothek verlassen. Nichts außerhalb von `library/sounds/` wird
angefasst. Was mit den Memes passiert, steht im letzten Abschnitt.

### `sound check`

```bash
npm run cli -- sound check
```

Sieht sich nach Handänderungen die ganze Bibliothek an und meldet, nach Id sortiert:

- einen Eintrag ohne seine `sound.wav`;
- eine Datei oder einen Ordner ohne Eintrag (`sound add` legt einen Eintrag an; ein Ordner allein wird nie einer);
- dieselbe Datei unter zwei Ids;
- einen Cue oder Trim, der nicht mehr in den Sound passt;
- einen Eintrag, der nicht lädt oder sich nicht messen lässt.

Eine von dir ersetzte WAV wird neu gemessen: `length`, `loudness` und `hash` werden neu geschrieben. Sonst wird
nichts hinzugefügt oder entfernt, und ein kaputter Eintrag beendet die Prüfung nie. Sie endet mit Code 1, wenn sie
etwas gemeldet hat.

## Von Hand bearbeiten

Du darfst `sound.yaml` im Editor bearbeiten. Eine Änderung über Claude Code prüft der Hook des Workspaces beim
Schreiben (`validate-file`) und lehnt einen zerbrochenen Eintrag ab; das Speichern in deinem Editor wird nicht
überwacht, also führe danach `sound check` aus. Die Regel ist dieselbe:

- das Schema muss laden (`LibrarySoundSchema`);
- `id` muss der Ordnername sein, und `sound.wav` muss neben dem Eintrag liegen;
- `title` und `use_when` dürfen nicht leer sein;
- `trim.start` vor `trim.end`, beide innerhalb von `length`; `cue` im getrimmten Sound.

Führe nach einer Runde Änderungen `sound check` aus. Er meldet, was Dateien und Einträge jetzt sagen; einen Cue oder
Trim, der nicht mehr passt, repariert er nie – ändere ihn mit `sound edit`. Um das Audio zu ändern, ersetze
`sound.wav` und führe `sound check` aus, der die neue Datei misst.

## Lizenzen und Credits

Jeder Sound hat eine Lizenz, und sie ist `unknown`, bis du eine angibst. Die Release-Prüfung (`qa` und die
TODO-Liste in `README.md` und `manifest.json` des Release-Ordners, die die Release-Ansicht des Boards zeigt) liest
die Lizenz jedes Sounds, den ein Meme übernommen hat:

- `unknown` → ein TODO;
- eine Lizenz, die Namensnennung verlangt (CC BY und seine Schreibweisen, `credit required`, `attribution …`) ohne
  `credit` → ein TODO;
- alles andere → nichts.

Das sind TODOs, nie ein gescheitertes Release: die Entscheidung liegt bei dir. Trage die Lizenz ein und, wo sie es
verlangt, den Credit-Text:

```bash
npm run cli -- sound edit vine-boom --licence "CC BY 4.0" --credit "Boom von Jane Doe, CC BY 4.0"
npm run cli -- sound edit vine-boom --licence own
```

`own` sagt, dass die Aufnahme deine ist (oder kein Credit nötig ist). Der Credit jedes Sounds, den ein Meme
übernommen hat, geht in die Plattformtexte des Memes – die Caption von TikTok, Reels und Shorts. Danach führe
`release` erneut aus.

## Wenn ein Sound sich ändert oder ein Meme ihn schon nutzt

Ein Meme verlinkt einen Bibliotheks-Sound nie: `voice-track` kopiert die getrimmte WAV als Take in das Meme und hält
fest, wovon er kopiert wurde – der Datei-Hash des Sounds und sein Trim.

- **Metadaten** (Titel, Wofür, Schlagworte, Quelle, Lizenz, Credit) lassen die Kopie des Memes unberührt; ein fertiges
  Video ändert sich nicht.
- **Ein neuer Trim oder eine neue WAV** (von Hand ersetzt und von `sound check` gemessen): der Take passt nicht mehr
  zu dem, woraus er gemacht wurde. Der nächste `voice-track` (`/video-next`) kopiert den Sound neu; rendere das Meme
  erneut.
- **Ein neuer Cue** lässt das Audio des Memes unberührt, aber ein Shot, der auf `line:<id>:cue` verankert ist, landet
  woanders. Rendere das Meme erneut.
- **Entfernen**: das Meme behält seinen Take und bleibt reproduzierbar. Der nächste `/video-next` warnt, dass der
  Bibliotheks-Sound nicht mehr in der Bibliothek ist; Lizenz und Credit sind dort nicht mehr, also meldet die
  Release-Prüfung ihn als fehlend. Kein Shot kann danach auf seinem Cue verankert werden.

Einen Sound, den die Bibliothek nicht mehr hält, schlägt das Skill einem neuen Meme nie vor.

## Siehe auch

- [Das Board: Sounds](board.md#sounds) – die Bibliothek im Browser, mit Upload, Abspielen und Bearbeiten
- [ADR 0051](adr/0051-memes-and-the-sound-library.md) – die Entscheidung hinter der Bibliothek
- `sound --help` – jeder Befehl und jede Option

<p align="center">
  <img src="docs/header.svg" width="800" alt="FestRide: Carpooling to concerts and festivals in Poland">
</p>

<p align="center">
  <br>
  Pick a gig, find a car that's going, and see how well you'd get along<br>
  with the driver <b>before you ask for a seat</b>.
  <br><br>
</p>

> [!TIP]
> **✨ Creative twist: a vibe check before the ride**
>
> Other carpooling apps show you the route, the price and the time. FestRide also tells you **whether you'll get along in the car**. Every driver and passenger gets a **match score** built from music taste, ride style (quiet, chatty or party) and smoking, plus a one-line AI note on why you'd click. A few hours on the road to a festival is a lot more fun with someone who likes the same music.

### 📸 Screenshots
<img src="docs/divider.svg" width="200" alt="">

![Landing page: "Every road ends at a stage", sentence search with the AI badge](docs/screenshots/landing.webp)

| | |
|---|---|
| ![Start: the next ride as a wristband card, requests waiting for a yes, picks for you](docs/screenshots/home.webp) | ![Search: six drivers to one show, ranked by match, routes on a map of Poland](docs/screenshots/search.webp) |
| **Start**: your next ride, requests still waiting, suggestions | **Find a ride**: drivers ranked by match, routes on the map |
| ![Ride detail: 69 % good match, score breakdown, AI line on why you'd get along](docs/screenshots/ride.webp) | ![Driver panel: two passengers asking, each with their match score](docs/screenshots/drive.webp) |
| **A ride**: why the score is what it is, with a one-line AI summary | **Drive**: passengers waiting for a yes, with their match |
| ![Offer a ride: one sentence filled in the event, city, departure, seats and price](docs/screenshots/offer.webp) | <img src="docs/screenshots/phone-home.webp" width="49%" alt="Start on a phone"> <img src="docs/screenshots/phone-search.webp" width="49%" alt="Search on a phone, with the pinned map"> |
| **Offer a ride**: one sentence fills the whole form | **On a phone**: Start and search with the pinned map |

### 🎪 Features
<img src="docs/divider.svg" width="200" alt="">

#### 🎧 Know your driver before you ride
A **match score** from music taste, ride style and smoking, so you know who you're getting into the car with.

#### 💬 Just say where you're going
Type *"z Łodzi na techno do Krakowa, max 50 zł"* and it turns into filters. Drivers can offer a ride in **one sentence** too.

#### ✨ AI that helps, not takes over
Gemini writes the driver's note and **one line on why you'd get along**. No key? The app still works.

#### 🎟️ One seat, one yes
The **first "yes" takes the seat** and closes your other requests to that event.

#### 🌅 Made for the road
Route map, phone layout, Polish / English and a dark theme.

### 🛠️ Technologies
<img src="docs/divider.svg" width="200" alt="">

| Category | Stack |
|---|---|
| **Backend** | ![Python](https://img.shields.io/badge/Python-3776AB?style=flat-square&logo=python&logoColor=white) ![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white) ![SQLModel](https://img.shields.io/badge/SQLModel-7E56C2?style=flat-square&logo=python&logoColor=white) ![SQLite](https://img.shields.io/badge/SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white) |
| **Auth** | ![JWT](https://img.shields.io/badge/JWT-000000?style=flat-square&logo=jsonwebtokens&logoColor=white) |
| **Frontend** | ![React 19](https://img.shields.io/badge/React_19-20232A?style=flat-square&logo=react&logoColor=61DAFB) ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white) ![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white) |
| **Map** | ![Leaflet](https://img.shields.io/badge/Leaflet-199900?style=flat-square&logo=leaflet&logoColor=white) ![OpenStreetMap](https://img.shields.io/badge/OpenStreetMap-7EBC6F?style=flat-square&logo=openstreetmap&logoColor=white) |
| **AI & data** | ![Google Gemini (optional)](https://img.shields.io/badge/Google_Gemini-optional-8E75B2?style=flat-square&logo=googlegemini&logoColor=white) ![Ticketmaster API (optional)](https://img.shields.io/badge/Ticketmaster_API-optional-026CDF?style=flat-square&logo=ticketmaster&logoColor=white) |
| **Testing** | ![pytest](https://img.shields.io/badge/pytest-0A9EDC?style=flat-square&logo=pytest&logoColor=white) |

### 🚀 Quick start
<img src="docs/divider.svg" width="200" alt="">

About 5 minutes, no API keys needed. You need **Python 3.11+** and **Node 20+**, and two terminals.

**1. Backend**

```bash
cd backend
python -m venv .venv
# Windows:      .venv\Scripts\activate
# macOS/Linux:  source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env              # Windows (cmd): copy .env.example .env

python import_events.py           # events (Ticketmaster with a key, otherwise 8 samples)
python seed_demo.py               # demo users, rides and requests
uvicorn app.main:app --reload --port 8000
```

**2. Frontend**

```bash
cd frontend
npm install
npm run dev
```

**3. Open** http://localhost:5173 and log in:

> **Email:** `demo@example.com` &nbsp;·&nbsp; **Password:** `festride-demo`

Demo events stay upcoming for about a week; refresh them with `python seed_demo.py --reset`.

**Optional keys** in `backend/.env`: `TICKETMASTER_API_KEY` ([get one](https://developer.ticketmaster.com)) for real events,
`GEMINI_API_KEY` ([free](https://aistudio.google.com)) for AI. After adding the Ticketmaster key, run `import_events.py` and `seed_demo.py --reset` again.

### ✨ How I used AI tools
<img src="docs/divider.svg" width="200" alt="">

I built FestRide with **Claude Code** (CLI), but I made the key decisions and reviewed the code myself.

#### 1. Planning with grill-me

I started with the **grill-me** skill. I described the app and the features I wanted, and Claude asked me questions until the plan was clear: the technologies, the scope and how each feature should work. Every decision went into [`docs/decisions.md`](docs/decisions.md). I also asked Claude to open a pull request after every step of that plan.

#### 2. Subagents

I set up three subagents, each with its own job:

- **code-reviewer** checked the code after every step, before the pull request
- **match-evaluator** checked that the match algorithm scores and ranks people correctly
- **ai-prompt-tester** sent real and tricky prompts to the AI features and checked how they responded

Claude then wrote the backend step by step, and I checked it live and reviewed each pull request.

#### 3. Finding the visual direction

When the backend was working, it was time for the frontend. As I'm not a graphic designer and wasn't sure about the look, I turned to AI for help and tried three combinations. Each one ran in a separate CLI session and a fresh project folder, so it didn't know about the other skills or designs:

| Combination | Result |
|---|---|
| Claude Design + frontend-design | Clean, but basic. You could tell it was made by AI from a mile away. |
| Claude + Mobbin + impeccable | The same structure every time. It never had the vibe of the app and felt like another project dropped into it. |
| **Claude + Mobbin + taste-skill** | **The winner.** A colourful site with a real festival vibe, not the usual AI look. Mobbin gave the design patterns and taste-skill made the screens. |

I gave my feedback and added details that show it's a carpooling app for music fans, not just another music app. I also asked a friend whether the design had its own visual identity before I made the final choice. I'm really happy with the result, and Mobbin turned out to be a great help for good-looking UI/UX.

#### 4. Building and testing

Claude built the chosen design 1:1 in code while I followed the changes as they happened. Then I tested the site, listed the mistakes I found, and did the same for the mobile version until it was fully responsive. For testing I used the **claude-in-chrome** skill, so Claude could check the page in my browser, while I also tested it manually myself.

The subagents were really worth it, especially **code-reviewer**. It found a lot of bugs after each step, and they were fixed before the pull request. I used match-evaluator and ai-prompt-tester once each, to test those features at the end.

#### Summary

 I used AI in almost every part of the project, but I still checked the code myself and tested the site and its features manually. I chose technologies I know, so I could understand what is happening in the code.

The subagents were really worth it, especially code-reviewer: it found a lot of bugs after each step, and they were fixed before the pull request. Overall, the things that helped most were planning with grill-me before writing any code, the code reviews, and Mobbin with taste-skill for a design that doesn't look AI-made.

AI made the work much faster: building a site like this by hand would have taken me far more time.

### 💌 Contact
<img src="docs/divider.svg" width="200" alt="">

Built by **Maja** — feel free to reach out:

- GitHub: [@majkab8](https://github.com/majkab8)
- Email: [majab.praca@gmail.com](mailto:majab.praca@gmail.com)
- LinkedIn: [Maja Bednarek](https://www.linkedin.com/in/maja-bednarek-599119324/)

### 🙏 Acknowledgements
<img src="docs/divider.svg" width="200" alt="">

- **Xelerit**, for the opportunity to build this project
- **[Ticketmaster Discovery API](https://developer.ticketmaster.com)**, for the event data
- **[OpenStreetMap](https://www.openstreetmap.org/copyright)** contributors and **[Leaflet](https://leafletjs.com)**, for the map
- **[Natural Earth](https://www.naturalearthdata.com)**, for Poland's border (public domain)
- **Krzysztof Popławski**, for the festival photos on the landing page (CC BY 4.0)
- **[Google Gemini](https://ai.google.dev)**, for the AI features

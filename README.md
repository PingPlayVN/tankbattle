🎮 Game Modes
🔫 PvP (Local)

2 người chơi trên cùng thiết bị

Tùy chỉnh phím điều khiển cho từng player

Hỗ trợ One-Shot và Deathmatch (HP)

🤖 PvE (Player vs AI)

Đấu với BOT thông minh

AI có độ khó & tính cách:

BALANCED 🤖

RUSHER ⚔️

SNIPER 🎯

CAMPER ⛺

AI có:

Né đạn

Canh góc bắn

Dự đoán va chạm tường

🌐 Online Multiplayer (Peer-to-Peer)

Sử dụng PeerJS

Host tạo phòng → Client nhập Room ID

Đồng bộ:

Tank position

Bullet

Laser

Power-up

Wall destruction

Host là authoritative server

📱 Mobile Support

✔ Virtual Joystick
✔ Fire button
✔ Lock landscape orientation
✔ Sensitivity & size configurable

Mobile input được xử lý riêng trong mobileInput và mobileSettings

🔥 Weapons System

Game hỗ trợ nhiều loại vũ khí đặc biệt, mỗi loại có:

Ammo

Cooldown

Damage

Drop weight

Hiệu ứng riêng

Ví dụ vũ khí
Weapon	Description
NORMAL	Đạn thường
LASER	Xuyên bản đồ
DEATHRAY	Quét 180°
GATLING	Bắn nhanh
DRILL	Phá tường
MISSILE	Tự tìm đường
FRAG	Nổ mảnh
MINE	Mìn tàng hình
SHIELD	Chặn đạn & laser
FLAME	Phun lửa tầm gần

👉 Tỉ lệ rơi có thể chỉnh trực tiếp trong Settings UI

❤️ HP & Damage System

Có thể bật Deathmatch mode

Mỗi tank có HP (MAX_HP)

Damage tính theo bảng DAMAGE_TABLE

Shield có thời gian hiệu lực

🧱 Map & Environment

✔ Maze sinh ngẫu nhiên
✔ Wall có thể phá
✔ Barrel nổ
✔ Night Mode
✔ Screen shake & VFX

🧠 AI Design

AI dựa trên:

Distance control

Line of sight

Bounce prediction

Personality parameters:

aggression

stop distance

reaction delay

AI config nằm trong:

AI_DIFFICULTY
AI_PERSONALITY

⚙️ Architecture Overview
Core Loop
Input → Update → Collision → Network Sync → Render

Main Systems

Game loop

Collision system

Weapon system

AI system

Network sync

UI / Menu system

🌐 Networking Model

Host

Xử lý physics & logic

Gửi state cho client

Client

Chỉ render

Gửi input

Sync rate được giới hạn để giảm lag.

🛠️ Configuration & Settings

✔ Spawn rate
✔ Max items
✔ AI difficulty
✔ Weapon drop rates
✔ Controls remap
✔ Mobile settings

Settings được khóa nếu không phải Host khi chơi online.

🧪 Debug & Dev Notes

Code hiện tại chưa dùng ES6 module (global-based)

Có thể refactor sang:

Game.js

Tank.js

WeaponSystem.js

NetworkManager.js

Object pooling rất phù hợp để tối ưu bullets & particles

🗺️ Roadmap (Future Ideas)

 Object Pooling cho Bullet / Particle

 Replay system

 Ranked matchmaking

 Sound effects & music

 Minimap

 Spectator mode

🧑‍💻 Author

PingPlayVN
Tank Battle – JavaScript Canvas Game

📜 License

MIT License
Free to use, modify & share.

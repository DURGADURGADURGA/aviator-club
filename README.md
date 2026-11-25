# Aviator Club (dosto ka time-pass, asli paisa nahi)

## Game kaise chalta hai
1. Dost website kholte hain aur **Sign up** karte hain (0 diamonds se shuru).
2. Wallet ke **+** button se "Diamonds maango" request bhejte hain.
3. Aap (admin) **Admin tab** me request **Approve** karte hain, diamonds wallet me aa jate hain.
4. Dost bet lagate hain, plane udta hai, crash se pehle **Cash Out** karna hota hai.

Admin tab me aapko dikhta hai: kitne log online hain, kitne round me khel rahe hain, bet pool,
pending requests, sabhi players (online hara dot) aur unke diamonds. Seedha diamonds dena/kam karna
aur agla crash point set karna bhi wahin se hota hai.

Admin login: naam `admin`, password = `ADMIN_PASS` (default `admin123`, zaroor badlein).

## Computer par test karna
    npm install
    ADMIN_PASS=apnaPassword node server.js
(Windows: `set ADMIN_PASS=apnaPassword && node server.js`)
Browser me: http://localhost:3000
Same WiFi ke dost: http://<aapke-computer-ka-IP>:3000

## Free hosting par live karna (Render.com)
1. github.com par free account banayein, **New repository** banayein, is folder ki files upload karein
   (`node_modules` aur `data.json` upload na karein).
2. render.com par GitHub se login karein. **New +** > **Web Service** > apni repo chunein.
3. Settings:
   - Runtime: **Node**
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Instance type: **Free**
4. **Environment** me `ADMIN_PASS` naam se apna admin password daalein.
5. **Deploy** dabayein. 2-3 minute baad `https://naam.onrender.com` link milega. Wahi dosto ko bhejein.

### Free hosting ki limits
- Kuch der koi na aaye to server so jata hai, phir pehli baar kholne par 30-60 sec lagte hain.
- Server restart ya naya deploy hone par accounts aur diamonds **reset** ho jate hain (free disk temporary hai).
- Prank ke ek-do din ke liye ye theek hai.

## Zaroori baat
Diamonds sirf game ke hain. Is website me UPI, card ya payment ka koi form nahi hai aur na hi hona chahiye.
Dosto se asli paisa lena ya unhe asli paise ka lalach dena prank nahi, dhokha hai.
Crash point admin ke control me hai, isliye prank ke baad dosto ko sach zaroor bata dein.

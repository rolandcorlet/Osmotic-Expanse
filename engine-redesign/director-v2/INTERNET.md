# Playing over the internet

Director v2 serves the whole table from one port: **TCP 8790** (change it with `--port`).
Players need two things: the address and the six-letter table code. Nothing is installed on their side.

## 1. Start the table
```
cd engine-redesign/director-v2
node server.mjs
```
The window prints the host link, the table code, this PC's home-network address (for example `192.168.0.23`) and the port.

## 2. Let the PC accept the connection (Windows, once, as Administrator)
```
netsh advfirewall firewall add rule name="Osmotic Director v2" dir=in action=allow protocol=TCP localport=8790
```

## 3. Forward the port on the router
1. Open `http://192.168.0.1` in a browser on the home network and sign in to the router.
2. Find **Port Forwarding** (also called Virtual Server or NAT Forwarding, usually under Advanced).
3. Add one rule:

| Field | Value |
|---|---|
| Name | Osmotic |
| Protocol | TCP |
| External (WAN) port | 8790 |
| Internal IP | this PC's address as printed by the server, e.g. 192.168.0.23 |
| Internal port | 8790 |

4. Save. Only this one port is needed. Do **not** forward the model's port (8080, 1234, 11434): the model is only ever called by this PC.
5. In the router's DHCP page, reserve the PC's address (often "Address Reservation") so the rule keeps pointing at it after a restart.

## 4. Give players the address
Your public address is shown on the router's status page as "WAN IP" or "Internet IP". Players open:
```
http://<that address>:8790
```
and type their name and the table code. Test it from a phone on mobile data, not on your Wi-Fi.

If the router's WAN IP starts with 10., 100.64-100.127., 172.16-31. or 192.168., your provider is sharing one address between customers (CGNAT) and port forwarding cannot work. Use a tunnel instead (below).

## What is and is not exposed
- Players can only join with the table code. Eight wrong codes from one address locks that address out for ten minutes. The host can issue a new code at any time (Host tab), and remove a seat.
- The host console (model settings, API key, new game, undo) answers **only on the home network**, even with the right key. Start with `--host-anywhere` to change that; not advised.
- API keys live in `saves/config.json` on this PC and are never sent to any screen.
- The connection is plain HTTP, so it is not encrypted. Nothing sensitive crosses it (a display name, the table code, game moves), but do not reuse a real password as a name or code. For an encrypted link use a tunnel.
- Close the port forward rule when you are not playing.

## No port forwarding: a tunnel
With `cloudflared` installed, `cloudflared tunnel --url http://localhost:8790` prints an `https://…trycloudflare.com` address players can use. It is encrypted and needs no router change. Tailscale works too if every player installs it.

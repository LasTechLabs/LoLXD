const fetch = require("node-fetch");
var cors = require("cors");
const express = require("express");
const fs = require("fs-extra");
const path = require("path");
const { argv } = require("process");
// const childProcess = require("child_process");
let clientInterface = require("lolxd-client-interface");
const app = express();
var expressWs = require("express-ws")(app);
const PORT = 1337;
let HOST = "localhost";
let local_settings_JSON = {};

if (argv.includes("--network")) {
	HOST = "0.0.0.0";
}

app.use(
	cors({
		origin: "*",
	})
);

clientInterface.lifecycleEvents.on("connected", function (data) {
	let clientState = clientInterface.getClientState();

	let broadcastClients = expressWs.getWss("/ws");
	broadcastClients.clients.forEach((client) => {
		client.send(
			JSON.stringify({
				LCUInstanceConnected: true,
				LCIInstallDirectory: clientState.installDirectory,
				status: "connected",
			})
		);
		client.send(
			JSON.stringify({
				status: "gamephase update",
				gamePhase: clientState.gamePhase,
			})
		);
	});
});

clientInterface.lifecycleEvents.on("disconnected", function (data) {
	let broadcastClients = expressWs.getWss("/ws");
	broadcastClients.clients.forEach((client) => {
		client.send(
			JSON.stringify({
				LCUInstanceConnected: false,
				status: "disconnected",
			})
		);
	});
});

clientInterface.lifecycleEvents.on("gameflowphaseUpdate", function (data) {
	let clientState = clientInterface.getClientState();

	let broadcastClients = expressWs.getWss("/ws");
	broadcastClients.clients.forEach((client) => {
		client.send(
			JSON.stringify({
				status: "gamephase update",
				gamePhase: clientState.gamePhase,
			})
		);
	});
});


//is server running (ping-pong)
app.get("/ping", (req, res) => {
	res.status(200).send("pong");
});

app.ws("/ws", function (ws, req) {
	let clientState = clientInterface.getClientState();

	ws.send(
		JSON.stringify({
			status: "LoLXD server connection established",
			LCUInstanceConnected: clientState.isConnected,
			LCIInstallDirectory: clientState.installDirectory,
		})
	);

	ws.send(
		JSON.stringify({
			status: "gamephase update",
			gamePhase: clientState.gamePhase,
		})
	);

	ws.on("message", function (msg) {
		if (msg === "__PING__") {
			ws.send(JSON.stringify({ status: "__PONG__" }));
		}
	});
});

app.post("/bugfix/unresponsive/gracefulreset", async (req, res) => {
	try {
		await clientInterface.restartUx();
		res.status(200).json({ code: "SUCCESS" });
	} catch (err) {
		console.log(err);
		res.status(500).json(err);
	}
});

app.post("/bugfix/unresponsive/hardreset", async (req, res) => {
	try {
		await clientInterface.forceRestartUx();
		res.status(200).json({ code: "SUCCESS" });
	} catch (err) {
		console.log(err);
		res.status(500).json(err);
	}
});

app.get("/addedfunction/togglemute/isenabled", async (req, res) => {
	try {
		let InisUpdated = await clientInterface.getPremadeVoiceSettings();

		if (
			InisUpdated.vadSensitivity === 0 &&
			InisUpdated.inputMode === "voiceActivity"
		) {
			res
				.status(200)
				.json({ code: "SUCCESS", enabled: true, data: InisUpdated });
		} else {
			res
				.status(200)
				.json({ code: "SUCCESS", enabled: false, data: InisUpdated });
		}
	} catch (err) {
		console.log(err);
		res.status(500).json(err);
	}
});

app.post("/addedfunction/togglemute/enable", async (req, res) => {
	try {
		let InisUpdated = await Promise.all(
			clientInterface.setPremadeVoiceSettings()
		);
		InisUpdated = await Promise.all(
			InisUpdated.map((x) => {
				return x.text();
			})
		);

		res.status(200).json({ code: "SUCCESS", data: InisUpdated });
	} catch (err) {
		console.log(err);
		res.status(500).json(err);
	}
});

app.post("/addedfunction/togglemute/toggle", async (req, res) => {
	try {
		await clientInterface.toggleMute();
		res.status(200).json({ code: "SUCCESS" });
	} catch (err) {
		console.log(err);
		res.status(500).json(err);
	}
});

app.get("/addedfunction/bettermute", async (req, res) => {
	try {
		await clientInterface.betterMute();
		res.status(200).json({ code: "SUCCESS" });
	} catch (err) {
		console.log(err);
		res.status(500).json(err);
	}
});

app.get("/utility/getlocalsettings/:localsetting", async (req, res) => {
	try {
		res.status(200).json({
			code: "SUCCESS",
			[req.params.localsetting]: local_settings_JSON[req.params.localsetting],
		});
	} catch (err) {
		console.log(err);
	}
});

app.get("/utility/getroflpath", async (req, res) => {
	try {
		let InisUpdated = await clientInterface.getReplaysPath();

		res.status(200).json({ code: "SUCCESS", path: InisUpdated });
	} catch (err) {
		console.log(err);
		res.status(500).json({ code: "ERROR - (probably disconnected LCU)" });
	}
});

app.post(
	"/utility/updatelocalsettings/:localsetting/:settingval",
	async (req, res) => {
		try {
			let outcome;
			if (
				req.params.settingval === "true" ||
				req.params.settingval === "false"
			) {
				outcome = await clientInterface.updateLocalSettings(
					req.params.localsetting,
					req.params.settingval === "true"
				);
			} else {
				outcome = await clientInterface.updateLocalSettings(
					req.params.localsetting,
					req.params.settingval
				);
			}
			local_settings_JSON[outcome.updated] = outcome.updatedValue;
			let toWrite = "";
			Object.entries(local_settings_JSON).forEach((pair) => {
				toWrite = toWrite.concat(`${pair[0]}=${pair[1]}\n`);
			});
			fs.writeFile(path.join(__dirname, "Settings", "settings.ini"), toWrite);
			res.status(200).json({
				code: "SUCCESS",
				updated: outcome.updated,
				updatedVal: outcome.updatedValue,
			});
		} catch (err) {
			console.log(err);
			res.status(500).json(err);
		}
	}
);

app.post("/addedfunction/changelocale/:newlocale", async (req, res) => {
	try {
		let a = await clientInterface.restartWithLocale(req.params.newlocale);
		res.status(200).json({ code: "SUCCESS" });
	} catch (err) {
		console.log(err);
		res.status(500).json(err);
	}
});

app.post("/addedfunction/spawnMultipleClient", async (req, res) => {
	try {
		let a = await clientInterface.spawnMultipleClient();
		res.status(200).json({ code: "SUCCESS" });
	} catch (err) {
		console.log(err);
		res.status(500).json(err);
	}
});

app.get("/utility/runes/getcurrentpage", async (req, res) => {
	try {
		let page = await clientInterface.getCurrentRunePage();
		page = await page.json();
		res.status(200).json({ code: "SUCCESS", data: page });
	} catch (err) {
		console.log(err);
		res.status(500).json(err);
	}
});

app.get("/utility/runes/getpagebyid/:id", async (req, res) => {
	try {
		let page = await clientInterface.getRunePageById(req.params.id);
		page = await page.json();
		res.status(200).json({ code: "SUCCESS", data: page });
	} catch (err) {
		console.log(err);
		res.status(500).json(err);
	}
});

app.get("/utility/runes/setpagebyid/:id", async (req, res) => {
	try {
		let a = await clientInterface.setRunePageById(
			req.params.id,
			req.query.name
		);
		a = await a.json();
		res.status(200).json({ code: "SUCCESS" });
	} catch (err) {
		console.log(err);
		res.status(500).json(err);
	}
});

app.get("/utility/runes/getallpages", async (req, res) => {
	try {
		let runepages = await clientInterface.getAllRunePages();
		runepages = await runepages.json();
		res.status(200).json({ code: "SUCCESS", data: runepages });
	} catch (err) {
		console.log(err);
		res.status(500).json(err);
	}
});

app.post("/utility/runes/update", async (req, res) => {
	try {
		let runepages = await clientInterface.updateRunes(
			req.query.runes,
			req.query.primarystyle,
			req.query.substyle
		);
		res.status(200).json({ code: "SUCCESS", data: runepages });
	} catch (err) {
		console.log(err);
		res.status(500).json(err);
	}
});

app.get("/utility/settings/list/:type", async (req, res) => {
	try {
		let settings = await clientInterface.getGameSettings(req.params.type);
		settings = await settings.json();
		res.status(200).json({ code: "SUCCESS", data: settings });
	} catch (err) {
		console.log(err);
		res.status(500).json(err);
	}
});

app.post("/utility/settings/set", express.json(), async (req, res) => {
	/*
    //Example Request - set toggle extended zoom to ctrl shift z
	let a = await fetch(`http://localhost:1337/utility/settings/set`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			input: {
				GameEvents: {
					evtToggleExtendedZoom: "[Ctrl][Shift][z]",
				},
			},
		}),
	});
    */

	try {
		await clientInterface.setGameSettings(req.body.input, req.body.game);
		res.status(200).json({ code: "SUCCESS" });
	} catch (err) {
		console.log(err);
		res.status(500).json(err);
	}
});

app.get("/addedfunction/replayloader/getallreplays", async (req, res) => {
	try {
		let InisUpdated = await clientInterface.getAllReplays();
		InisUpdated = await Promise.all(InisUpdated);
		res.status(200).json({ code: "SUCCESS", data: InisUpdated });
	} catch (err) {
		console.log(err);
		res.status(500).json(err);
	}
});

app.post(
	"/addedfunction/replayloader/playreplay/:replayfile",
	async (req, res) => {
		try {
			let InisUpdated = await clientInterface.playReplay(
				req.params.replayfile,
				path.join(__dirname, "Settings")
			);

			res.status(200).json({ code: "SUCCESS" });
		} catch (err) {
			console.log(err);
			res.status(500).json(err);
		}
	}
);

app.get("/utility/runes/getAllRuneInfo", async (req, res) => {
	try {
		let InisUpdated = await Promise.all([
			clientInterface.getAllRunesStyles(),
			clientInterface.getAllRunes(),
		]);
		InisUpdated = await Promise.all(
			InisUpdated.map((e) => {
				return e.json();
			})
		);

		let output = InisUpdated[0].map((skilltree) => {
			return {
				skilltreeName: skilltree.name,
				skilltreeIcon: skilltree.iconPath,
				runes: skilltree.slots.map((skillrow) => {
					return skillrow.perks.map((rune) => {
						return InisUpdated[1].find((expandedRune) => {
							return expandedRune.id === rune;
						});
					});
				}),
			};
		});

		res.status(200).json({ code: "SUCCESS", data: output });
	} catch (err) {
		console.log(err);
		res.status(500).json(err);
	}
});

app.get("/utility/proxy/*", async (req, res) => {
	try {
		let InisUpdated = await clientInterface.getRuneIcon(
			req.originalUrl.substring(15)
		);
		img = await InisUpdated.buffer();
		res.writeHead(200, {
			"Content-Type": "image/png",
			"Content-Length": img.length,
		});

		res.end(img);
	} catch (err) {
		console.log(err);
		res.status(500).json(err);
	}
});

/*
app.get("/test", async (req, res) => {
	try {
		let InisUpdated = await clientInterface.getGameSettings("game");

		InisUpdated = await InisUpdated.json();

		console.log(InisUpdated);
		res.status(200).json({ code: "SUCCESS", data: InisUpdated });
	} catch (err) {
		console.log(err);
		res.status(500).json(err);
	}
});
*/
app.use("/bugfix/*", (req, res) => {
	res.status(404).json({ code: "ENDPOINT NOT FOUND" });
});

app.use("/addedfunction/*", (req, res) => {
	res.status(404).json({ code: "ENDPOINT NOT FOUND" });
});

app.use("/utility/*", (req, res) => {
	res.status(404).json({ code: "ENDPOINT NOT FOUND" });
});

app.use(
	express.static(path.join(__dirname, "build"), {
		index: "index.html",
		extensions: ["html"],
		redirect: true
	})
);

app.get("*", (req, res) => {
	res.redirect("/")
});

async function startup() {
	try {
		await fs.ensureDir(path.join(__dirname, "Settings"));
		await fs.ensureFile(path.join(__dirname, "Settings", "settings.ini"));
		let local_settings = await fs.readFile(
			path.join(__dirname, "Settings", "settings.ini"),
			"utf-8"
		);
		local_settings.split("\n").forEach(async (setting) => {
			if (setting != "") {
				if (
					setting.split("=")[1].trim() === "true" ||
					setting.split("=")[1].trim() === "false"
				) {
					let outcome = await clientInterface.updateLocalSettings(
						setting.split("=")[0],
						setting.split("=")[1].trim() === "true"
					);
					local_settings_JSON[outcome.updated] = outcome.updatedValue;
				} else {
					let outcome = await clientInterface.updateLocalSettings(
						setting.split("=")[0],
						setting.split("=")[1].trim()
					);
					local_settings_JSON[outcome.updated] = outcome.updatedValue;
				}
			}
		});
	} catch (err) {
		console.log(err);
	}
	try {
		let running = await fetch(`http://localhost:1337/ping`);
		if (running.status === 200) {
			console.log(`\nLoLXD is already running!\nGo to http://localhost:${PORT}\n`);
			process.exit();
			// childProcess.exec(
			// 	`start chrome.exe -incognito http://localhost:${PORT}`,
			// 	() => {
			// 		process.exit();
			// 	}
			// );
		}
	} catch (err) {
		if (err.code === "ECONNREFUSED") {
			app.listen(PORT, HOST, () => {});
			started_time = Date.now();
			clientInterface.start();
			console.log(`\nLoLXD running!\nGo to http://localhost:${PORT}\n`);
			// childProcess.exec(
			// 	`start chrome.exe -incognito http://localhost:${PORT}`,
			// 	() => {
			// 	}
			// );
		}
	}
}

startup();

exports.startGlobal = ()=>{} //In case someone wants to install as a global package. See bin/global-index.js to understand.
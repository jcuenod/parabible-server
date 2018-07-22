var MongoClient = require('mongodb').MongoClient
import express from 'express'
import compression from 'compression'
import bodyParser from 'body-parser'
import cors from 'cors'

import { chapterText } from "./api/chapter-text"
import { textFromNodeArray } from "./api/text-from-node"
import { wordLookup } from "./api/word-lookup"
import { termSearch, collocationSearch } from "./api/term-search"

import Log from "./util/logging"

let things = {
	mongo: false,
	express: false
}
console.log("WAITING:", Object.keys(things))
const declare_ready = (thing) => {
	console.log("READY:", thing)
	things[thing] = true
	if (Object.keys(things).reduce((c, k) => c && things[k], true)) {
		console.log("READY READY READY!")
	}
}


const requiredEnvVar = (variable) => {
	if (!process.env.hasOwnProperty(variable)) {
		console.log(`Sorry, we need "${variable}" to be set`)
		process.exit()
	}
	return process.env[variable]
}

const mongoConnectionString = requiredEnvVar("MONGO_CONNECTION_STRING")
const mongoDatabase = requiredEnvVar("MONGO_DATABASE")
const mongoUrl = `mongodb://${mongoConnectionString}/${mongoDatabase}`

let mongoConnection = null;
MongoClient.connect(mongoUrl, (err, db) => {
	if (err) {
		console.log("Error setting up mongo connection")
		console.log(err)
	}
	else {
		mongoConnection = db
		declare_ready("mongo")
	}
})

let app = express()
app.use(compression())
app.use(bodyParser.json())
app.use(cors())
let port = +process.env.PORT || 3000
let host = process.env.HOST || "127.0.0.1"
let server = app.listen(port, host, () => {
	console.log("Server listening to %s:%d within %s environment", host, port, app.get('env'))
	declare_ready("express")
})

// Use X-Forwarded-For
app.set('trust proxy', 'loopback')


console.log("Setting up routes")
app.post(['/api', '/api/*'], (req, res) => {
	const api_request = req.params
	const params = req.body
	console.log(api_request[0])
	Log({ api_request, params, ip_address: req.ip })

	let responsePromise = new Promise((resolve, reject) => resolve())
	switch(api_request[0]) {
		case "term-search":
			responsePromise = termSearch(params, mongoConnection)
			break
		case "collocation-search":
			responsePromise = collocationSearch(params)
			// response = termSearch(params) 
			break
		case "word-study":
			// response = termSearch(params) 
			break
		case "word-lookup":
			responsePromise = wordLookup(params, mongoConnection) 
			break
		case "term-highlights":
			// response = termSearch(params) 
			break
		case "chapter-text":
			responsePromise = chapterText(params, mongoConnection)
			break
		case "node-text":
			responsePromise = textFromNodeArray(params)
			break
		default:
			responsePromise = new Promise((resolve, reject) => {
				reject({
					"error": "Invalid api request. Request should be formatted /api/<type of request>",
					"options": [
						"term-search",
						"collocation-search",
						"word-study",
						"word-lookup",
						"term-highlights",
						"chapter-text"
					]
				})
			})
			break
	}
	responsePromise.then((response) => {
		res.send(response)
	}).catch((response) => {
		res.send(response)
		console.log("error")
		console.log(response)
	})
})


// const clientRoot = "./client/build"
const clientRoot = requiredEnvVar("PARABIBLE_CLIENT_DIR")
const getUrl = (mobile) => {
	if (mobile)
		return '/mobile.html'
	else
		return '/index.html'
}
const needsFonts = (userAgent) => {
	// technically this is not mobile - it's whether or not to dump fonts into the index.html
	const regexForMobile = {
		// Windows: /windows nt/i,
		WindowsPhone: /windows phone/i,
		// Mac: /macintosh/i,
		// Linux: /linux/i,
		Wii: /wii/i,
		Playstation: /playstation/i,
		iPad: /ipad/i,
		iPod: /ipod/i,
		iPhone: /iphone/i,
		Android: /android/i,
		Blackberry: /blackberry/i,
		Samsung: /samsung/i,
		// Curl: /curl/i
		Mobile: /mobile/i
	}
	return Object.keys(regexForMobile).reduce((a, k) =>
		a || regexForMobile[k].test(userAgent),
	false)
}

// Route order matters - the first listed will be invoked
app.get("/", (req, res) => {
	res.sendFile(getUrl(needsFonts(req.headers["user-agent"])), {root: clientRoot})
})
app.use(express.static(clientRoot))
app.get("*", (req, res) => {
	res.sendFile(getUrl(needsFonts(req.headers["user-agent"])), {root: clientRoot})
})
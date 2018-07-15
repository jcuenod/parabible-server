import { arrayDiff, arrayIntersect } from '../util/util'
import { uniqueValuePerArray } from '../util/uniqueValuePerArray'
import { ridlistText } from './chapter-text'

// import word_data from '../../data/word_data_map'
import tree_data from '../../data/tree_data'
import range_node_data from '../../data/range_node_data'
import book_names from '../../data/book_names'
var mysql      = require('mysql')
var connection = mysql.createConnection({
  host     : 'localhost',
  user     : 'root',
  password : 'fish',
  database : 'parabible_test'
})
connection.connect()
// TODO: When should we end the connection?
//		 connection.end()

const RESULT_LIMIT = 500

const doLog = true
const consoleLog = async (...debug) => {
	if (doLog) {
		console.log(...debug)
	}
}


const heatUpVerseWords = (verse_words, hot_set, lukewarm_set) => {
	return verse_words.map(accentUnit => 
		accentUnit.map(w => {
			if (hot_set.has(w["wid"]))
				w["temperature"] = 2
			else if (lukewarm_set.has(w["wid"]))
				w["temperature"] = 1
			return w
		})
	)
}

const _doFilter = (filter, wordNodes, chapterFilter=0) => {
	if (filter.length > 0) {
		const chapterOffset = chapterFilter * 1000
		const ridFilter = filter.map(f => book_names[f] * 10000000 + chapterOffset)

		const extent = chapterFilter === 0 ? 10000000 : 1000
		return wordNodes.filter(w => {
			const rid = tree_data[w].verse
			return ridFilter.reduce((a, v) => a || v <= rid && rid < v + extent, false)
		})
	}
	else {
		return wordNodes
	}
}
const _wordsThatMatchQuery = (query, filter, chapterFilter=0) => {
	let query_matches = []
	Object.keys(query).forEach((k) => {
		const v = query[k].normalize("NFKD")
		query_matches.push(_doFilter(filter, word_data[k][v], chapterFilter))
	})
	return arrayIntersect(...query_matches)
}
const _queryForWids = async ({queryArray, search_range, search_filter}) => {
	let word_matches = []
	let exclusions = []
	let current_match = -1
	let starttime = process.hrtime()

	const promises = queryArray.map((query) => new Promise((resolve, reject) => {
		consoleLog("BENCHMARK Q: foreach cycle ", process.hrtime(starttime))
		// const query_matches = await _wordsThatMatchQuery(query.data, search_filter)

		//THIS IS THE NEW _wordsThatMatchQuery
		const selectionQuery = `
			SELECT wid, _${search_range}_node AS range_variable FROM wide_test
			WHERE ${Object.keys(query.data).map(k => `_${k} = ${JSON.stringify(query.data[k].normalize("NFKD"))}`).join(" AND ")}
		`
		consoleLog(selectionQuery)
		connection.query(selectionQuery, (error, results) => {
			if (query.invert)
				exclusions.push(...results)
			else
				word_matches.push(results)
			resolve()
		})
	}))
	await Promise.all(promises)
	consoleLog("BENCHMARK Q: done with foreach", process.hrtime(starttime))
	
	const matches_by_search_range = word_matches.map(m => m.map(n => n.range_variable))
	const exclusions_by_search_range = exclusions.map(m => m.range_variable)
	const matches_by_search_range_intersection = arrayIntersect(...matches_by_search_range)
	const range_matches = arrayDiff(matches_by_search_range_intersection, exclusions_by_search_range)

	consoleLog("BENCHMARK Q: done intersecting", process.hrtime(starttime))
	const matched_words_by_range = {}
	word_matches.forEach((qMatches, i) => {
		qMatches.forEach(w => {
			if (!matched_words_by_range.hasOwnProperty(w.range_variable)) {
				matched_words_by_range[w.range_variable] = []
				for (let i = 0; i < word_matches.length; i++) {
					matched_words_by_range[w.range_variable].push([])
				}
			}
			matched_words_by_range[w.range_variable][i].push(w.wid)
		})
	})
	consoleLog("BENCHMARK Q: built some helpers", process.hrtime(starttime))
	const range_matches_with_unique_limit = range_matches.map(range_node => {
		const words_in_range = matched_words_by_range[range_node]
		const should_include = uniqueValuePerArray(words_in_range) ? words_in_range : false
		return {
			sr_node: range_node,
			matching_word_nodes: should_include
		}
	}).filter(m => m && m.matching_word_nodes !== false)
	consoleLog("BENCHMARK Q: query el indep. repr.", process.hrtime(starttime))
	consoleLog("RESULTS:", range_matches_with_unique_limit.length)
	return range_matches_with_unique_limit
}

const termSearch = async (params, db) => {
	let starttime = process.hrtime()
	consoleLog("BENCHMARK: **querying for WIDS", process.hrtime(starttime))
	const matches = await _queryForWids({
		queryArray: params["query"],
		search_range: params["search_range"] || "clause",
		search_filter: params["search_filter"] || []
	})
	let truncated = false
	if (matches.length > RESULT_LIMIT) {
		truncated = matches.length
		matches.splice(RESULT_LIMIT)
	}
	consoleLog("BENCHMARK: **getting matching word sets", `(matches.length: ${matches.length}/${truncated})`, process.hrtime(starttime))
	const words_in_matching_ranges_set = new Set(matches.reduce((c, m) => c.concat(...range_node_data[m.sr_node]["wids"]), []))
	const all_word_matches = matches.reduce((c,n) => c.concat(...n.matching_word_nodes), [])
	const actual_matching_words_set = new Set(arrayIntersect(all_word_matches, words_in_matching_ranges_set))
	
	consoleLog("BENCHMARK: -- more of **getting matching word sets", process.hrtime(starttime))
	// Allowed texts
	const paramTexts = params["texts"] || []
	const allowedTexts = ["wlc", "net", "lxx"]
	let textsToReturn = allowedTexts.filter(f => paramTexts.indexOf(f) !== -1)
	if (textsToReturn.length === 0)
		textsToReturn = ["wlc", "net"]

	consoleLog("BENCHMARK: **now formulating final data", process.hrtime(starttime))
	const ridmatches = matches.reduce((c, n) => c.concat(...range_node_data[n.sr_node]["rids"]), [])
	const ridMatchText = await ridlistText(ridmatches, new Set(textsToReturn), db)
	Object.keys(ridMatchText).forEach(rid => {
		ridMatchText[rid]["wlc"] = heatUpVerseWords(
			ridMatchText[rid]["wlc"],
			actual_matching_words_set,
			words_in_matching_ranges_set
		)
	})
	consoleLog("BENCHMARK: **results now being processed", process.hrtime(starttime))
	const match_result_data = matches.map((m) => {
		const ridTextObject = {}
		range_node_data[m.sr_node]["rids"].forEach(rid => {
			ridTextObject[rid] = ridMatchText[rid]
		})
		return {
			"node": m.sr_node,
			"verses": range_node_data[m.sr_node]["rids"],
			"text": ridTextObject
		}
	})

	const response = {
		"truncated": truncated,
		"results": match_result_data
	}
	consoleLog("BENCHMARK: **done", process.hrtime(starttime))
	consoleLog(`TermSearch: ${match_result_data.length} results (${process.hrtime(starttime)})`)
	return(response)
}

const collocationSearch = (params)=> {
	const grouping_key = "voc_utf8"
	return new Promise((resolve, reject) => {
		// TODO: the syntax of _queryForWids has changed since this line...
		// !!!!!!!!!!!!!!
		const { word_matches } = _queryForWids({
			queryArray: params["query"],
			search_range: params["search_range"]
		})
		// params["whitelist"] == ["Verb""NFKD"]
		const word_match_morph= word_matches.map(wid => word_data[wid][grouping_key])
		const tally_match_data = word_match_morph.reduce((c, k) => {
			if (!c.hasOwnProperty(k))
				c[k] = 0
			c[k]++
			return c
		}, {})

		const response = {
			"length": Object.keys(tally_match_data).length,
			"results": tally_match_data
		}
		resolve(response)
	})
}

export { termSearch, collocationSearch, _wordsThatMatchQuery }
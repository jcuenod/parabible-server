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

const tableName = "wide_test"
const createRange = n => [...Array(n).keys()]
const flatten = arrayOfArrays => [].concat(...arrayOfArrays)

const eachWid = count => createRange(count).map(n => `word${n}.wid as wid${n}`).join(", ")
const oneTablePerWord = count => createRange(count).map(n => `${tableName} AS word${n}`).join(", ")
const widUniqueToLower = highCount => 
	createRange(highCount - 1).map(n => `word${n}.wid != word${highCount - 1}.wid`)
const eachWidUnique = count => 
	flatten(createRange(count - 1).map(n => widUniqueToLower(n + 2))).join(" AND ")


const eachRangeNodeEqual = (count, rangeVariable) => 
	[...Array(count - 1).keys()]
		.map(n => `word0.${rangeVariable} = word${n + 1}.${rangeVariable}`)
		.join(" AND ")

const oneQuery = (query, n) =>
	"(" + Object.keys(query).map(k => `word${n}._${k} = ${JSON.stringify(query[k].normalize("NFKD"))}`).join(" AND ") + ")"
const eachQuery = termQueries => 
	termQueries.map((query, i) => oneQuery(query.data, i)).join(" AND ")


const widsWithinFilter = (filter, chapterFilter=0) => {
	const chapterOffset = chapterFilter * 1000
	const extent = chapterFilter === 0 ? 9999999 : 999
	return "(" +
		filter.map(f => {
			const value1 = book_names[f] * 10000000 + chapterOffset
			const value2 = book_names[f] * 10000000 + chapterOffset + extent
			return `(word0._verse_node BETWEEN ${value1} AND ${value2})`
		}).join(" OR ")
	+ ")"
}

const validRanges = ["phrase", "clause", "sentence", "verse"]
const validSearchRange = searchRange => validRanges.includes(searchRange) ? `_${searchRange}_node` : "_verse_node"

const selectQuery = ({searchTermQueries, searchRange, searchFilter, texts}) => {
	const queryCount = Object.keys(searchTermQueries).length
	const treeNode = validSearchRange(searchRange)

	const whereClauseElements = []
	whereClauseElements.push(eachQuery(searchTermQueries))
	if (queryCount > 1) {
		whereClauseElements.push(eachRangeNodeEqual(queryCount, treeNode))
		whereClauseElements.push(eachWidUnique(queryCount))
	}
	if (searchFilter.length) {
		whereClauseElements.push(widsWithinFilter(searchFilter))
	}

	return `
		SELECT
			${eachWid(queryCount)},
			word0.${treeNode} AS tree_node,
			rid_range_by_tree_node.lower_rid,
			rid_range_by_tree_node.upper_rid
		FROM
			${oneTablePerWord(queryCount)},
			rid_range_by_tree_node
		WHERE
			${whereClauseElements.join("\n\t\t\tAND\n\t\t\t")}
			AND
			rid_range_by_tree_node.tree_node = word0.${treeNode}
		ORDER BY
			word0.${treeNode};`
}

const termSearch = async (params, db) => {
	let starttime = process.hrtime()
	if (!params["texts"]) {
		consoleLog("ERROR: you must request at least one text")
		return "ERROR: you must request at least one text"
	}
	//TODO: sanitise texts
	consoleLog("BENCHMARK: running sql query", process.hrtime(starttime))
	const sqlQuery = selectQuery({
		searchTermQueries: params["query"],
		searchRange: params["search_range"] || "verse",
		searchFilter: params["search_filter"] || [],
		texts: params["texts"]
	})
	const results = await new Promise((resolve, reject) => {
		connection.query(sqlQuery, (error, results) => {
			resolve(results)
		})
	})
	consoleLog(sqlQuery)
	consoleLog("BENCHMARK: returning...", process.hrtime(starttime))
	return {
		"count": results.length,
		"results": results.slice(0, 5000)
	}
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

export { termSearch, collocationSearch }



// SELECT
// 	w1.wid,
// 	w2.wid,
// 	w1._phrase_node AS tree_node
// FROM
// 	wide_test AS w1,
// 	wide_test AS w2
// WHERE
// 		(w1._sp = "prps" AND w1._ps = "p3" AND w1._nu = "sg")
// 	AND
// 		(w2._voc_utf8 = "יֹום")
// 	AND
// 		w1._phrase_node = w2._phrase_node;


// SELECT
// 	t1.wid, t2.wid, t1.tree_node
// FROM
// 	(SELECT wid, _phrase_node AS tree_node FROM wide_test WHERE _sp = "prps" AND _ps = "p3" AND _nu = "sg") t1,
// 	(SELECT wid, _phrase_node AS tree_node FROM wide_test WHERE _voc_utf8 = "יֹום") t2
// WHERE
// 	t1.tree_node = t2.tree_node



// const heatUpVerseWords = (verse_words, hot_set, lukewarm_set) => {
// 	return verse_words.map(accentUnit => 
// 		accentUnit.map(w => {
// 			if (hot_set.has(w["wid"]))
// 				w["temperature"] = 2
// 			else if (lukewarm_set.has(w["wid"]))
// 				w["temperature"] = 1
// 			return w
// 		})
// 	)
// }

// const _doFilter = (filter, wordNodes, chapterFilter=0) => {
// 	if (filter.length > 0) {
// 		const chapterOffset = chapterFilter * 1000
// 		const ridFilter = filter.map(f => book_names[f] * 10000000 + chapterOffset)

// 		const extent = chapterFilter === 0 ? 10000000 : 1000
// 		return wordNodes.filter(w => {
// 			const rid = tree_data[w].verse
// 			return ridFilter.reduce((a, v) => a || v <= rid && rid < v + extent, false)
// 		})
// 	}
// 	else {
// 		return wordNodes
// 	}
// }
// const _wordsThatMatchQuery = (query, filter, chapterFilter=0) => {
// 	let query_matches = []
// 	Object.keys(query).forEach((k) => {
// 		const v = query[k].normalize("NFKD")
// 		query_matches.push(_doFilter(filter, word_data[k][v], chapterFilter))
// 	})
// 	return arrayIntersect(...query_matches)
// }
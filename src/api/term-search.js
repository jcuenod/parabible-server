import db from '../util/sql'
import book_names from '../../data/book_names'
import text_data from '../../data/text_data'
import { consoleLog } from '../util/do-log'

const RESULT_LIMIT = 2500

const tableName = "word_features"
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
	"(" + Object.keys(query).map(k => {
		console.log(n, k, query[k])
		return `word${n}._${k} = ${query[k].normalize("NFKD")}`
	}).join(" AND ") + ")"
const eachQuery = termQueries =>
	termQueries.map((query, i) => oneQuery(query.data, i)).join(" AND ")

const widsWithinFilter = (filter, chapterFilter = 0) => {
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

const generateTermSearchSelectQuery = ({ searchTermQueries, searchRange, searchFilter }) => {
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

// SANITISATION
// - sanitiseSearchRange
const possibleSearchRanges = new Set(["phrase", "clause", "sentence", "verse"])
const sanitiseSearchRange = searchRange => {
	if (!searchRange) return "verse"
	const validSearchRange = possibleSearchRanges.has(searchRange)
	if (!validSearchRange) {
		throw ({
			"error": "Invalid `search_range` parameter. Expected string.",
			"options": Array.from(possibleSearchRanges)
		})
	}
	return searchRange
}

// - sanitiseSearchFilter
const book_name_keys = new Set(Object.keys(book_names))
const sanitiseSearchFilter = filter => {
	if (!filter || filter.length === 0) return []
	const validSearchFilter = filter.reduce(f => book_name_keys.has(f))
	if (!validSearchFilter) {
		throw ({
			"error": "Invalid `search_filter` parameter. Expected array of strings.",
			"options": Array.from(book_name_keys)
		})
	}
	return filter
}

const available_word_feature_set = new Set(text_data.available_word_features)
const sanitiseQuery = query => {
	if (!query || query.length === 0) {
		throw ({
			"error": "The `query` parameter is required. Expected: Array of objects.",
			"options": {
				"[uid]": "A unique identifier for this search term.",
				"[inverted]": "Option to find clauses without this term (currently not implemented).",
				"data": "Object specifying word feature (key) / value pairs."
			}
		})
	}

	const featureAvailableOrThrow = feature => {
		if (!available_word_feature_set.has(feature)) {
			throw ({
				"error": "Invalid `query.data` parameter. Expected: Object specifying word feature (key) / required value pairs.",
				"options": text_data.available_word_features,
				"extra": `Missing ${JSON.stringify(feature)}`
			})
		}
	}
	const newQuery = query.map(st => {
		const toReturn = {}
		if (st.hasOwnProperty("uid") && !/^[\d\w]+$/.test(st.uid)) {
			// uid can only be letters and numbers
			throw ({ "error": "Expected alphanumeric string for `uid` in `query`" })
		}
		else {
			toReturn["uid"] = st.uid
		}
		if (st.hasOwnProperty("inverted") && typeof st.inverted !== 'boolean') {
			// inverted must be a boolean
			throw ({ "error": "Expected boolean for `inverted` in `query.data`" })
		}
		else {
			toReturn["inverted"] = st.inverted
		}
		const newData = {}
		Object.keys(st.data).forEach(feature => {
			featureAvailableOrThrow(feature)
			// newData[feature] = sql.escape(st.data[feature])
			newData[feature] = st.data[feature]
		})
		toReturn["data"] = newData
		return toReturn
	})
	return newQuery
}

const sanitiseParams = params => ({
	searchTermQueries: sanitiseQuery(params["query"]),
	searchRange: sanitiseSearchRange(params["search_range"]),
	searchFilter: sanitiseSearchFilter(params["search_filter"])
})

const termSearch = async (params) => {
	let starttime = process.hrtime()
	consoleLog("BENCHMARK: starting termSearch function", process.hrtime(starttime))

	const { searchTermQueries, searchRange, searchFilter } = sanitiseParams(params)

	consoleLog("BENCHMARK: running sql query", process.hrtime(starttime))
	const sqlQuery = generateTermSearchSelectQuery({
		searchTermQueries,
		searchRange,
		searchFilter
	})
	console.log(sqlQuery)
	const { error, results } = await db.query(sqlQuery)
	if (error) {
		throw ({ "error": "Something went wrong with the sql query for the term search." })
	}
	consoleLog(sqlQuery)
	consoleLog("BENCHMARK: returning...", process.hrtime(starttime))

	const returnValue = {
		count: results.rowCount
	}
	if (results.rowCount > RESULT_LIMIT) {
		returnValue["truncated"] = `The term-search api endpoint is throttled to return a maximum of ${RESULT_LIMIT} results.`
		returnValue["results"] = results.rows.slice(0, RESULT_LIMIT)
	}
	else {
		returnValue["results"] = results
	}
	return returnValue
}
export { termSearch }


// const collocationSearch = (params)=> {
// 	const grouping_key = "voc_utf8"
// 	return new Promise((resolve, reject) => {
// 		// TODO: the syntax of _queryForWids has changed since this line...
// 		// !!!!!!!!!!!!!!
// 		const { word_matches } = _queryForWids({
// 			queryArray: params["query"],
// 			search_range: params["search_range"]
// 		})
// 		// params["whitelist"] == ["Verb""NFKD"]
// 		const word_match_morph= word_matches.map(wid => word_data[wid][grouping_key])
// 		const tally_match_data = word_match_morph.reduce((c, k) => {
// 			if (!c.hasOwnProperty(k))
// 				c[k] = 0
// 			c[k]++
// 			return c
// 		}, {})

// 		const response = {
// 			"length": Object.keys(tally_match_data).length,
// 			"results": tally_match_data
// 		}
// 		resolve(response)
// 	})
// }


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
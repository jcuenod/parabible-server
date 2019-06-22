import db from '../util/db'
import sanitizeParams from './term-search-util/sanitize-params'
import singleTermCTE from './term-search-util/single-term-cte'
import invertedSingleTermCTE from './term-search-util/inverted-single-term-cte'

const extractQueriesByType = (queries) => {
	return queries.reduce((a,v,i) => {
		if ("inverted" in v && v.inverted) {
			a.invertedTermQueries.push(v.data)
		}
		else {
			a.termQueries.push(v.data)
		}
		return a
	}, {termQueries: [], invertedTermQueries: []})
}

const groupedWith = (queries, tree_node_type) => {
	const { termQueries, invertedTermQueries } = extractQueriesByType(queries)
	if (termQueries.length === 0) {
		throw new Exception("You have to look for something - can't just search for inversions")
	}

	const regularCTEs = termQueries
		.map(singleTermCTE(tree_node_type))
		.map((k, i) => `w${i} AS ${k}`)
	const invertedCTEs = invertedTermQueries
		.map(invertedSingleTermCTE(tree_node_type))
		.map((k, i) => `wi${i} AS ${k}`)
	const withClause = regularCTEs.concat(...invertedCTEs).join(",\n\t")

	const selectClause = termQueries
		.map((k, i) => `w${i}.wid AS wid_${i}`)
		.join(",\n\t")

	const fromClause = termQueries
		.map((k, i) => `w${i}`)
		.join(", ")

	const whereClauseItems = []
	if (termQueries.length > 1) {
		// Tree node must be the same
		whereClauseItems.push(termQueries.slice(1).map((k, i) =>
			`w0.tree_node = w${i + 1}.tree_node`
		).join(" AND "))
		// Set cover must be possible (at least one unique wid per term in query)
		// this is a hard concept to put in human language but:
		// [1,2,3], [2], [3]   = true  //e.g. [1,2,3]
		// [1],[2],[1,2]       = false //[1,2,?]
		// [1,2], [1,2], [1,2] = false //[1,2,?] and [2,1,?]
		whereClauseItems.push("is_set_cover_possible(" + termQueries.map((k, i) => `w${i}.wid`).join(", ") + ")", whereSameTreeNode)
	}
	if (invertedTermQueries.length > 0) {
		whereClauseItems.push(invertedTermQueries
			.map((k, i) => `w0.tree_node NOT IN (SELECT inverted_tree_node_array FROM wi${i})`)
			.join(" AND ")
		)
	}
	const whereClause = whereClauseItems.length > 0 ? "WHERE\n\t" + whereClauseItems.join("\nAND\n\t") : ""

	return `
WITH
	${withClause}

SELECT
	w0.tree_node,
	${selectClause}

FROM
	${fromClause}

${whereClause}`
}


const termSearch = params => {
	const {
		tree_node_type,
		term_queries
	} = sanitizeParams(params)

	const sql_statement = groupedWith(queryTerms, tree_node)

	return new Promise((resolve, reject) => {
		db.query(sql_statement, (err, results) => {
			if (err) {
				reject(err)
			}
			else {
				resolve(results)
			}
		})
	})
}
export default termSearch
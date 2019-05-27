import book_names from '../../data/book_names.json'
import { sanitiseTextsAndGetIds, sanitiseNodes } from '../util/sanitization'
import db from '../util/database'

// import { _wordsThatMatchQuery } from './term-search'


const _processResults = results => {
    const resultKeys = Object.keys(results[0])
    delete resultKeys["tree_node"]
    delete resultKeys["rid"]
    return results.map(r => {
        resultKeys.forEach(k => {
            r[k] = JSON.parse(r[k])
        })
        return r
    })
}

const chapterText = async (params) => {
    console.time("benchmark")
    console.timeLog("benchmark", "starting chapter-text")
    const ref = params.reference
    const textArray = sanitiseTextsAndGetIds(params["texts"])

    // let highlights = {}
    // if (params.hasOwnProperty("search_terms")) {
    // 	params.search_terms.forEach(st => {
    // 		highlights[st.uid] = _wordsThatMatchQuery(st.data, [ref.book], ref.chapter)
    // 	})
    // }

    const selectVersePerText = textArray.map(t => `v_${t.name}.stringified_verse_text as ${t.name}_text`)
    const fromVersePerText = textArray.map(t => `verses v_${t.name}`)
    const whereVersePerText = textArray.map(t => `(v_${t.name}.rid = tree_node_map.rid AND v_${t.name}.text_id = ${t.id})`)

    const minv = book_names[ref.book] * 10000000 + ref.chapter * 1000
    const maxv = book_names[ref.book] * 10000000 + (ref.chapter + 1) * 1000 - 1

    console.timeLog("benchmark", "building query")
    const selectionQuery = `
        SELECT
            tree_node_map.tree_node,
            tree_node_map.rid,
            ${selectVersePerText},
            tree_node_map.stringified_wid_array
        FROM
            tree_node_map,
            ${fromVersePerText}
        WHERE
                tree_node_map.tree_node BETWEEN ${minv} AND ${maxv}
			AND
				${whereVersePerText.join(" AND ")};`

    console.log(selectionQuery)
    console.timeLog("benchmark", "BENCHMARK: running chapter text query")
    const { error, results } = await db.query(selectionQuery)
    console.timeLog("benchmark", "BENCHMARK: query done")
    if (error) {
        throw ({ "error": "Something went wrong with the sql query for the node array." })
    }

    const resultCount = results.length

    return {
        count: resultCount,
        results: _processResults(results)
    }
}
export { chapterText }

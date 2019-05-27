import db from '../util/database'
import { sanitiseTextsAndGetIds, sanitiseNodes } from '../util/sanitization'
import { consoleLog } from '../util/do-log'


const RESULT_LIMIT = 500

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

const textFromNodeArray = async (params) => {
    console.time("benchmark")
    console.timeLog("benchmark", "BENCHMARK: beginning fromNodeArray")
    const { nodes, texts } = params
    const sanitisedNodes = sanitiseNodes(nodes)
    const { nodeArray, isTruncated } = sanitisedNodes.length > RESULT_LIMIT ?
        { nodeArray: sanitisedNodes.slice(0, RESULT_LIMIT), isTruncated: true } :
        { nodeArray: sanitisedNodes, isTruncated: false }

    const textArray = sanitiseTextsAndGetIds(texts)

    const selectVersePerText = textArray.map(t => `v_${t.name}.stringified_verse_text as ${t.name}_text`)
    const fromVersePerText = textArray.map(t => `verses v_${t.name}`)
    const whereVersePerText = textArray.map(t => `(v_${t.name}.rid = tree_node_map.rid AND v_${t.name}.text_id = ${t.id})`)

    const nodeSlice = nodeArray.slice(0, RESULT_LIMIT)
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
                tree_node_map.tree_node IN (${nodeSlice})
            AND
                ${whereVersePerText.join(" AND ")};`

    consoleLog(selectionQuery)
    console.timeLog("benchmark", "BENCHMARK: running query")
    const { error, results } = await db.query(selectionQuery)
    console.timeLog("benchmark", "BENCHMARK: query done")
    if (error) {
        throw ({ "error": "Something went wrong with the sql query for the node array." })
    }

    const resultCount = results.length

    const returnValue = {
        count: resultCount,
        results: _processResults(results)
    }
    if (isTruncated) {
        returnValue["truncated"] = `The node-text api endpoint is throttled to requesting a maximum of ${RESULT_LIMIT} nodes.`
    }
    return returnValue
}
export { textFromNodeArray }
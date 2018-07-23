import sql from '../util/sql'
import { consoleLog } from '../util/do-log'
import text_data from '../../data/text_data'


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

const sanitiseNodes = nodes => {
    const nodeArray = []
    try {
        nodes.forEach(n => nodeArray.push(+n))
    }
    catch (e) {
        throw({ "error": "The `nodes` parameter must be an array of integers." })
    }

    if (nodeArray.length > RESULT_LIMIT) {
        return { nodeArray: nodeArray.slice(0, RESULT_LIMIT), isTruncated: true }
    }
    else {
        return { nodeArray, isTruncated: false }
    }
}
const sanitiseTexts = texts => {
    const validTexts = texts.reduce((a, v) => a && text_data.text_id[v] > 0)
    if (!validTexts) {
        throw({
            "error": "The `texts` parameter must be an array of strings.",
            "options": Object.keys(text_data.text_id)
        })
    }
    return texts
}

const textFromNodeArray = async (params) => {
    const starttime = process.hrtime()
    consoleLog("BENCHMARK: beginning fromNodeArray", process.hrtime(starttime))
    const { nodes, texts } = params
    const { nodeArray, isTruncated } = sanitiseNodes(nodes)
    const textArray = sanitiseTexts(texts)

    const selectVersePerText = textArray.map(t => `v_${t}.stringified_verse_text as ${t}_text`)
    const fromVersePerText = textArray.map(t => `verses v_${t}`)
    const whereVersePerText = textArray.map(t => `(v_${t}.rid = tree_node_map.rid AND v_${t}.text_id = ${text_data.text_id[t]})`)

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
    consoleLog("BENCHMARK: running query", process.hrtime(starttime))
    const { error, results } = await sql.query(selectionQuery)
    consoleLog("BENCHMARK: query done", process.hrtime(starttime))
    if (error) {
        throw({ "error": "Something went wrong with the sql query for the node array." })
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
import text_data from '../../data/text_data'

var mysql      = require('mysql')
var connection = mysql.createConnection({
  host     : 'localhost',
  user     : 'root',
  password : 'fish',
  database : 'parabible_test'
})
connection.connect()

// const textFromRidRange = ({upperBound, lowerBound, texts}) => {}

const textFromNodeArray = (params) => new Promise((reject, resolve) => {
    let starttime = process.hrtime()
    console.log("BENCHMARK: beginning fromNodeArray", process.hrtime(starttime))
    const { nodes, texts } = params
    // Make sure nodeArray is sanitary
    const nodeArray = []
    try {
        nodes.forEach(n => nodeArray.push(+n))
    }
    catch (e) { throw("node array must be array of integers") }

    const selectVerses = texts.map(t => `v_${t}.stringified_verse_text as ${t}_text`)
    const fromVerses = texts.map(t => `verses v_${t}`)
    const whereVerses = texts.map(t => `(v_${t}.rid = tree_node_map.rid AND v_${t}.text_id = ${text_data.text_id[t]})`)

    const selectionQuery = `
    SELECT
        tree_node_map.rid,
        ${selectVerses},
        tree_node_map.stringified_wid_array
    FROM
        tree_node_map,
        ${fromVerses}
    WHERE
            tree_node_map.tree_node IN (${nodeArray})
        AND
            ${whereVerses.join(" AND ")};`
    connection.query(selectionQuery, (error, results) => {
        console.log("BENCHMARK: query done", process.hrtime(starttime))
        resolve(results)
    })
})

// const versesPerTextPerWord = (queryCount, texts) => {
// 	const verseSelectClauses = flatten(texts.map(t => createRange(queryCount).map(n => `v_w${n}_${t}.stringified_verse_text AS ${t}${n}_text, word${n}._verse_node AS ${t}${n}_rid`)))
// 	const verseFromClauses = flatten(texts.map(t => createRange(queryCount).map(n => `verses AS v_w${n}_${t}`)))
// 	const verseWhereClauses = flatten(texts.map(t => createRange(queryCount).map(n => `(v_w${n}_${t}.rid = word${n}._verse_node AND v_w${n}_${t}.text_id = "${text_data.text_id[t]}")`)))
// 	return { verseSelectClauses, verseFromClauses, verseWhereClauses }
// }

export { textFromNodeArray }
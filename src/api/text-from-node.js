import { consoleLog } from '../util/do-log'
import text_data from '../../data/text_data'

import mysql from 'mysql'
const connection = mysql.createConnection({
  host     : 'localhost',
  user     : 'root',
  password : 'fish',
  database : 'parabible_test'
})
connection.connect()

// const textFromRidRange = ({upperBound, lowerBound, texts}) => {}

const textFromNodeArray = (params) => new Promise((reject, resolve) => {
    let starttime = process.hrtime()
    consoleLog("BENCHMARK: beginning fromNodeArray", process.hrtime(starttime))
    const { nodes, texts } = params
    // Make sure nodeArray is sanitary
    const nodeArray = []
    try {
        nodes.forEach(n => nodeArray.push(+n))
    }
    catch (e) {
        resolve({
            "error": "Node array must be an array of integers"
        })
    }

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
        consoleLog("BENCHMARK: query done", process.hrtime(starttime))
        if (error) {
            resolve({
                "error": "Something went wrong with the sql query for the node array"
            })
        }
        else {

        }
        resolve(results)
    })
})
export { textFromNodeArray }
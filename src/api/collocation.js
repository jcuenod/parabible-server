import { arrayIntersect } from '../util/util'
import word_data from '../../data/word_data_map'
import tree_data from '../../data/tree_data'
import range_node_data from '../../data/range_node_data'

const words_in_corpus = Object.keys(word_data["g_word_utf8"]).reduce((a,v) => {
    return a + word_data["g_word_utf8"][v].length
}, 0)

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
const _wordsThatMatchQuery = (query, filter=[], chapterFilter=0) => {
	let query_matches = []
	Object.keys(query).forEach((k) => {
		const v = query[k].normalize("NFKD")
		query_matches.push(_doFilter(filter, word_data[k][v], chapterFilter))
	})
	return arrayIntersect(...query_matches)
}

const _build_collocate_array = (matching_word_nodes) => {
    //TODO: what if there is no "clause"... we will have to use the window strategy...
    const matching_clauses = matching_word_nodes.map(n => tree_data[n]["clause"])
    return matching_clauses.reduce((a,v) => 
        a.concat(...range_node_data[v]["wids"])
    , [])
}
const _count_array_occurrences = (collocate_array) => {
    const index_map = {}

    // console.log("building lexeme map")
    const lexeme_map = []
    Object.keys(word_data["lex"]).forEach(k => {
        word_data["lex"][k].forEach(wid => {
            lexeme_map[wid] = k
        })
    })
    // console.log("done")

    const occurrence_calc = collocate_array.reduce((a,v) => {
        if (!index_map.hasOwnProperty(lexeme_map[v])) {
            index_map[ lexeme_map[v] ] = a.length
            a.push({
                "lexeme": lexeme_map[v],
                "count": 0
            })
        }
        a[ index_map[lexeme_map[v]] ].count++
        return a
    }, [])
    return {
        collocate_occurences_index: index_map,
        collocate_occurrences: occurrence_calc
    }
}

import {Decimal} from 'decimal.js'
const studyCollocates = (query) => {
    let starttime = process.hrtime()
    console.log("starting query", process.hrtime(starttime))
    const studied_word_nodes = _wordsThatMatchQuery(query.data)
    console.log(studied_word_nodes.length, process.hrtime(starttime))
    const collocate_word_nodes = _build_collocate_array(studied_word_nodes)
    const { collocate_occurences_index, collocate_occurrences } = _count_array_occurrences(collocate_word_nodes)
    console.log(collocate_occurrences.length, process.hrtime(starttime))
    
    const calculateExpected = (node, collocate, corpus_size) => {
        const d_node = Decimal(node)
        const d_collocate = Decimal(collocate)
        const d_corpus_size = Decimal(corpus_size)
        return d_node.times(collocate).dividedBy(corpus_size).toNumber()
    }
    const calculateMI = (observed, expected) => {
        const d_observed = new Decimal(observed)
        const d_expected = new Decimal(expected)
        return Decimal.log2(d_observed.dividedBy(d_expected)).toNumber()
    }
    
    const MIN_COLLOCATIONS = 5
    const filtered_collocations = collocate_occurrences.filter(c => c.count > MIN_COLLOCATIONS)
    console.log(filtered_collocations.length, process.hrtime(starttime))

    const node_occurrences = studied_word_nodes.length
    const collocation_mi = filtered_collocations.map(c => {
        const newEntry = Object.assign({}, c)
        newEntry["expected"] = calculateExpected(node_occurrences, c.count, words_in_corpus)
        newEntry["mi"] = calculateMI(c.count, newEntry["expected"])
        return newEntry
    })
    collocation_mi.sort((a,b) => a.mi - b.mi)
    console.log(collocation_mi)
}

studyCollocates({data:{ lex: "MQWM/" }})
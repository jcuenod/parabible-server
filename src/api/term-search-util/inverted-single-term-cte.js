/**
 * The point of this function is to return a Common Table Expression (CTE)
 * that will produce all the tree nodes that should be excluded for an
 * inverted search term.
 *
 * This should work on something like:
    {
      "_vt": "impv",
      "_vs": "piel"
    }
 *
 */
const invertedSingleTermCTE = tree_node_type => term_features => {
	const termKeys = Object.keys(term_features)
	validateKeysOrThrow(termKeys)
	const featureIntersection = termKeys.map((k, i) => `f${i}.wids`).join(" & ")
	const fromClause = termKeys.map((k, i) =>
		`feature_index AS f${i}`
	).join(",\n\t\t\t\t\t")
	const whereClause = termKeys.map((k, i) =>
		`f${i}.feature = '${k}' AND f${i}.value = '${term_features[k]}'`
	).join(" AND ")
	return `(
		SELECT
			word_features.${tree_node_type} AS inverted_tree_node_array
		FROM (
				SELECT
					UNNEST(${featureIntersection}) AS wid
				FROM
					${fromClause}
				WHERE
					${whereClause}
			) AS wid_list,
			word_features
		WHERE
			wid_list.wid = word_features.wid)`
}
export default invertedSingleTermCTE
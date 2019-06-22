/**
 * The point of this function is to return a Common Table Expression (CTE)
 * that will produce all the wids with the appropriate "tree_node" id that
 * match a set of features. We use the feature_index table that aggregates
 * and indexes feature data from word_features and use the intarray extension
 * to intersect the wids that match features.
 *
 * This should work on something like:
    {
      "_vt": "impv",
      "_vs": "piel"
    }
 *
 */
const singleTermCTE = tree_node_type => term_features => {
	const termKeys = Object.keys(term_features)
	const featureIntersection = termKeys.map((k, i) => `f${i}.wids`).join(" & ")
	
	const fromClause = termKeys.map((k, i) =>
		`feature_index AS f${i}`
	).join(",\n\t\t\t\t\t")
	
	const whereClause = termKeys.map((k, i) =>
		`f${i}.feature = '${k}' AND f${i}.value = '${term_features[k]}'`
	).join(" AND ")

	return `(
		SELECT
			array_agg(wid_list.wid) AS wid,
			word_features.${tree_node_type} AS tree_node
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
			wid_list.wid = word_features.wid
		GROUP BY
			tree_node)`
}
export default singleTermCTE
# Data Model

This is a place to talk about the data model.

The PCDM store takes an extreme, flattened view of data: All entities ("subjects") exist at the intersection of statements about that subject. Subjects don't meaningfully exist without something having been said about them ("statements"). Thus, bibs and items ("resources") are represented in the store not as `resource` entries but as any number of `resource_statement` entries. This means the schema for bibs and items is not constrained by the store.

## Statement Schema

The current schema for `resource_statement` follows:

```
 subject_id         | character varying(100)      | not null
 predicate          | character varying(50)       | not null
 object_id          | character varying(512)      | 
 object_literal     | text                        | 
 object_type        | character varying(50)       | 
 object_label       | text                        | 
 source_id          | integer                     | 
 source_record_id   | character varying(50)       | 
 source_record_path | character varying(50)       | 
 creator_id         | integer                     | not null
 index              | integer                     | not null
 created            | timestamp without time zone | 
```

These columns are best described in groups:

### Subject

The "subject" about which the statement is made is identified solely by the `subject_id`.

Examples:

- "b10721826" (NYPL Bib)
- "i10721826" (NYPL Item)
- "pb10721826" (Princeton Bib)
- "pi10721826" (Princeton Item)
- "cb10721826" (Columbia Bib)
- "ci10721826" (Columbia Item)

### Predicate

The statement property of the subject we're assigning a value is held by `predicate`.

Examples:

- "rdfs:type" (Class of record. e.g. nypl:Collection, nypl:Item)
- "dcterms:title" (Title of work)
- "dc:subject" (Subject string literal)
- "dc:date" (Integer date of creation)
- "bf:media" (Broadly, the form the physical object takes.)
- "bf:carrier" (Refines bf:carrier.)
- "nypl:placeOfPublication" (Geo name string literal)
- "nypl:suppressed" (Whether or not to suppress from public view.)

A predicate may repeat for a given subject. For example, a single subject may have multiple 'dc:subject's. To support repeated predicates for a given subject an `INTEGER index` column represents the numeric ranking. It also supports our four-column compound primary key:

```
PRIMARY KEY, btree (subject_id, predicate, creator_id, index)
```

For example, a single subject may have one 'dc:subject' "Mental illness -- Statistics." with `index` `0`, and a _second_ 'dc:subject' "Mental illness -- Case studies." with `index` `1`

### Object

Two primary columns exist to store object values: `object_literal` and `object_id`.

 * `object_literal`: Typically a long string or other scalar value that is not a strong identifier. Examples:
   - "The curse of the children/" (for predicate "dcterms:title")
   - "Mental illness -- Statistics." (for predicate "dc:subject"
   - 1974 (for predicate "dc:date")
   - FALSE (for predicate "nypl:suppressed")
 * `object_id`: Tends to be a short string, typically an identifier. Examples:
   - 'media:n' (for predicate bf:media)
   - 'carrier:nc' (for predicate bf:carrier)

Other `object_*` columns represent different aspects of the object being assigned.
 
 * `object_type`: The `@type` of the object
 * `object_label`: A place to store a denormalized label for the object (typically for a statement with an identifier stored in `object_id`)

### Source fields

Several `source_*` fields exist to store provenance information about the statement being made:

 * `source_id`: (NYPL identifier for datastore. e.g. source:10004 is Sierra, source:10005 is Recap)
 * `source_record_id`: (External local idenfier for record. e.g. bnum 10721826)
 * `source_record_path`: (Indicates where in the record the data was found. e.g. "260 $b", "008/35-37", "300 $a $b", "LDR/07", "fixed 'Material Type'")

### Additional fields

 * `creator_id`: Identifies the process that derived the data. (Presently we only have the Core Serializer)
 * `created`: Date statement created/updated

## Useful Queries

### Get all statements for a given bnum:

This will return all bib statements for bnum 'b14945553':

```
SELECT B.* 
FROM resource_statement B
WHERE subject_id='b14945553';
```

### Get items for a given bnum:

```
SELECT I.subject_id, I.predicate, I.object_id, I.object_literal 
FROM resource_statement I
WHERE I.subject_id IN (
  SELECT _I.subject_id
  FROM resource_statement _I
  WHERE _I.predicate = 'nypl:bnum'
  AND _I.object_id = CONCAT('urn:bnum:', 'b10952349')
)
```

### Get bib by item

Sometimes you have an item id and want statements about the parent bib. This will return all bib statements for item 'i15106165':

```
SELECT B.subject_id, B.predicate, B.object_id, B.object_literal 
FROM resource_statement B
WHERE B.subject_id = (
  SELECT REPLACE(object_id, 'urn:bnum:', '') 
  FROM resource_statement _R 
  WHERE _R.subject_id='i15831025' 
  AND _R.predicate='nypl:bnum'
)
```

### Get sibling items

If you have an item and want sibling items (common bib):

```
SELECT I.subject_id, I.predicate, I.object_id, I.object_literal 
FROM resource_statement I
WHERE I.subject_id IN (
  SELECT _I.subject_id
  FROM resource_statement _I
  WHERE _I.predicate = 'nypl:bnum'
  AND _I.object_id = (
    SELECT object_id
    FROM resource_statement __I
    WHERE __I.predicate = 'nypl:bnum'
    AND __I.subject_id='i15106165'
  )
)
ORDER BY I.subject_id ASC, I.predicate ASC
```

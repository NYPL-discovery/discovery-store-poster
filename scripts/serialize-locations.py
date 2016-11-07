# script to convert locations.csv to json-ld
# requires libraries/plugins: rdflib, rdflib-jsonld

from rdflib.namespace import RDF, SKOS
from rdflib import Namespace, Graph, plugin
from rdflib.serializer import Serializer
import rdflib
import csv

f = open('locations.csv')
reader = csv.DictReader(f)

nypl = Namespace('http://data.nypl.org/nypl-core/')
skos = Namespace('http://www.w3.org/2004/02/skos/core#')
dcterms = Namespace('http://purl.org/dc/terms/')
nyplLocation = rdflib.URIRef('http://data.nypl.org/locations/')
nyplOrg = rdflib.URIRef('http://data.nypl.org/orgs/')

g = Graph()

for r in reader:
    id = r['skos:notation']
    type = 'nypl:Location'
    preflabel = rdflib.Literal(r['skos:prefLabel'])
    notation = rdflib.Literal(r['skos:notation'])
    locationType = r['nypl:locationType'].split(';')
    actualLocation = r['nypl:actualLocation']
#     sublocationOf = r['dcterms:isPartOf']
    location = nyplLocation + str(id)
    
    g.add( (location, RDF.type, nypl.Location))
    g.add( (location, SKOS.prefLabel, preflabel))
    g.add( (location, SKOS.notation, notation))
    if r['dcterms:isPartOf'] != '':
        sublocationOf = nyplLocation + r['dcterms:isPartOf']
        g.add( (location, dcterms.isPartOf, sublocationOf))
    if r['nypl:owner'] != '':
        owner = nyplOrg + str(r['nypl:owner'])
        g.add( (location, nypl.owner, owner))
    if actualLocation != '':
        actualLocation = rdflib.Literal(actualLocation)
        g.add ( (location, nypl.actualLocation, actualLocation) )
    for l in locationType:
        if l != '':
            l = rdflib.Literal(l)
            g.add( (location, nypl.locationType, l))

z = open('sierra-codes-locations.json', 'wb')

context = {"dcterms": "http://purl.org/dc/terms/",
           "nypl": "http://data.nypl.org/nypl-core/",
           "skos": "http://www.w3.org/2004/02/skos/core#", 
           "nyplLocation": "http://data.nypl.org/locations/"}
z.write(g.serialize(format="json-ld", context=context))

z.close()


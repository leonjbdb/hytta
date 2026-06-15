# Oxford English style guide for `en-GB.json`

This project uses **Oxford spelling** (also called "Oxford English" or
"-ize spelling") for the `en-GB` locale. This is the convention adopted by
Oxford University Press, the OED, and many international bodies. It follows
British vocabulary in almost every respect — *colour*, *centre*, *travelled*,
*learnt*, *kerb*, *aluminium* — but uses the suffix **`-ize`** rather than
`-ise` for verbs derived from Greek `-ίζω`.

## Use these (and the matching `-ization` forms)

| Use            | Avoid           |
| -------------- | --------------- |
| organize       | organise        |
| organization   | organisation    |
| recognize      | recognise       |
| recognition    | (n/a)           |
| customize      | customise       |
| authorize      | authorise       |
| categorize     | categorise      |
| realize        | realise         |
| analyze*       | analyse         |
| memorize       | memorise        |
| optimize       | optimise        |

\* `analyze` comes from Greek `-λύω`, not `-ίζω`. Both *analyse* (BrE) and
*analyze* (Oxford / AmE) are acceptable; we follow Oxford and write
**analyze**.

## Keep British vocabulary and spelling everywhere else

- *colour*, not *color*
- *favour*, not *favor*
- *centre*, *theatre*, *fibre*, *metre* — never *-er*
- *travelled*, *cancelled*, *modelled* — double the consonant
- *learnt*, *spelt*, *dreamt* — `-t` past forms
- *kerb*, *tyre*, *aluminium*, *enrolment*, *practise* (verb) / *practice* (noun)

## Words to never use

`-ise` verbs (organise, recognise, realise, …) are explicitly forbidden in
`en-GB.json`. The `tests/i18n` suite enforces this.

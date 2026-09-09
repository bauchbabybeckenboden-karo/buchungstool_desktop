// Zentrale Definition der Kurstypen.
// "slug" entspricht dem URL-Pfad auf bauch-baby-beckenboden.de (z.B. /mamafit/)
// und dem Routen-Parameter hier im Tool (/kurse/:slug).

export const COURSE_TYPES = [
  {
    slug: 'mamafit',
    label: 'Mamafit',
    websitePath: '/mamafit/',
    extraFields: [],
  },
  {
    slug: 'schwangerfit',
    label: 'Schwangerfit',
    websitePath: '/schwangerfit/',
    extraFields: ['sportverbot', 'notfallkontakt', 'et'],
  },
  {
    slug: 'somatic-yoga',
    label: 'Somatic Yoga',
    websitePath: '/somatic-yoga/',
    extraFields: ['yoga-bestaetigungen'],
  },
  {
    slug: 'koerpermitte-beckenboden',
    label: 'Körpermitte & Beckenboden',
    websitePath: '/somatic-koerpermitte-beckenboden/',
    extraFields: ['koerpergrenzen', 'et-optional', 'info-baby-alter'],
  },
]

export function getCourseTypeBySlug(slug) {
  return COURSE_TYPES.find((c) => c.slug === slug)
}

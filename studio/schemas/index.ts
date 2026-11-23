import { aboutPage } from './aboutPage';
import { chef } from './chef';
import { communityLunch } from './communityLunch';
import { faqPage } from './faqPage';
import { menu } from './menu';
import { photo } from './photo';
import { richText } from './richText';
import { siteSettings } from './siteSettings';
import { takeaway } from './takeaway';

export const schemaTypes = [richText, photo, takeaway, menu, chef, communityLunch, aboutPage, faqPage, siteSettings];

// Documents that exist exactly once (edited, never created or deleted).
export const singletons = ['takeaway', 'communityLunch', 'aboutPage', 'faqPage', 'siteSettings'];

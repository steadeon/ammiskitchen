import { aboutPage } from './aboutPage';
import { chef } from './chef';
import { communityLunch } from './communityLunch';
import { faqPage } from './faqPage';
import { menu } from './menu';
import { order } from './order';
import { photo } from './photo';
import { richText } from './richText';
import { siteSettings } from './siteSettings';
import { takeaway } from './takeaway';

export const schemaTypes = [richText, photo, takeaway, menu, chef, communityLunch, aboutPage, faqPage, siteSettings, order];

// Documents that exist exactly once (edited, never created or deleted).
export const singletons = ['takeaway', 'communityLunch', 'aboutPage', 'faqPage', 'siteSettings'];

// Created only by the website's order form (so their IDs stay private), never with "+ Create".
export const noCreate = [...singletons, 'order'];

/**
 * Google Contacts (People API) Service
 * 
 * List, search, and create contacts.
 */

import { google } from 'googleapis';

function getPeople(auth: any) {
  return google.people({ version: 'v1', auth });
}

/** Format a contact for display */
function formatContact(person: any): string {
  const name = person.names?.[0]?.displayName || '(unnamed)';
  const emails = (person.emailAddresses || []).map((e: any) => e.value).join(', ');
  const phones = (person.phoneNumbers || []).map((p: any) => p.value).join(', ');
  const org = person.organizations?.[0]?.name || '';
  const resourceName = person.resourceName || '';

  const parts = [`👤 **${name}**`];
  if (emails) parts.push(`  📧 ${emails}`);
  if (phones) parts.push(`  📱 ${phones}`);
  if (org) parts.push(`  🏢 ${org}`);
  parts.push(`  ID: \`${resourceName}\``);

  return parts.join('\n');
}

/**
 * List contacts.
 */
export async function contactsList(
  auth: any,
  options?: { maxResults?: number },
): Promise<string> {
  const people = getPeople(auth);
  const pageSize = options?.maxResults ?? 30;

  const res = await people.people.connections.list({
    resourceName: 'people/me',
    pageSize,
    personFields: 'names,emailAddresses,phoneNumbers,organizations',
    sortOrder: 'FIRST_NAME_ASCENDING',
  });

  const connections = res.data.connections || [];
  if (connections.length === 0) {
    return 'No contacts found.';
  }

  const formatted = connections.map(formatContact).join('\n\n');
  return `Found ${connections.length} contact(s):\n\n${formatted}`;
}

/**
 * Search contacts by name, email, or phone.
 */
export async function contactsSearch(
  auth: any,
  query: string,
  maxResults?: number,
): Promise<string> {
  const people = getPeople(auth);

  const res = await people.people.searchContacts({
    query,
    readMask: 'names,emailAddresses,phoneNumbers,organizations',
    pageSize: maxResults ?? 20,
  });

  const results = res.data.results || [];
  if (results.length === 0) {
    return `No contacts found matching "${query}".`;
  }

  const formatted = results
    .map(r => r.person)
    .filter(Boolean)
    .map(formatContact)
    .join('\n\n');

  return `Found ${results.length} contact(s) matching "${query}":\n\n${formatted}`;
}

/**
 * Create a new contact.
 */
export async function contactsCreate(
  auth: any,
  options: { name: string; email?: string; phone?: string; organization?: string },
): Promise<string> {
  const people = getPeople(auth);

  const personData: any = {
    names: [{ givenName: options.name }],
  };

  if (options.email) {
    personData.emailAddresses = [{ value: options.email }];
  }
  if (options.phone) {
    personData.phoneNumbers = [{ value: options.phone }];
  }
  if (options.organization) {
    personData.organizations = [{ name: options.organization }];
  }

  const res = await people.people.createContact({
    requestBody: personData,
    personFields: 'names,emailAddresses,phoneNumbers,organizations',
  });

  const name = res.data.names?.[0]?.displayName || options.name;
  return `Contact "${name}" created. Resource: ${res.data.resourceName}`;
}

import { google } from 'googleapis';
import logger from '../../utils/logger';

export interface SheetValue {
  values: any[][];
  range: string;
}

export class GoogleSheetsClient {
  private sheets: any;
  private auth: any;

  constructor(accessToken: string) {
    this.auth = this.createOAuth2Client(accessToken);
    this.sheets = google.sheets({ version: 'v4', auth: this.auth });
  }

  /**
   * Create OAuth2 client for Google Sheets API
   */
  private createOAuth2Client(accessToken: string) {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({
      access_token: accessToken
    });

    return oauth2Client;
  }

  /**
   * Get all values from a sheet
   */
  async getValues(spreadsheetId: string, range: string): Promise<any[][]> {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range
      });

      return response.data.values || [];
    } catch (error) {
      logger.error(`Failed to get values from sheet: ${spreadsheetId}`, error);
      throw error;
    }
  }

  /**
   * Update values in a sheet
   */
  async updateValues(
    spreadsheetId: string,
    range: string,
    values: any[][]
  ): Promise<void> {
    try {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: 'RAW',
        resource: {
          values
        }
      });

      logger.info(`Updated sheet ${spreadsheetId} range ${range}`);
    } catch (error) {
      logger.error(`Failed to update sheet: ${spreadsheetId}`, error);
      throw error;
    }
  }

  /**
   * Append values to a sheet
   */
  async appendValues(
    spreadsheetId: string,
    range: string,
    values: any[][]
  ): Promise<void> {
    try {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption: 'RAW',
        resource: {
          values
        }
      });

      logger.info(`Appended to sheet ${spreadsheetId} range ${range}`);
    } catch (error) {
      logger.error(`Failed to append to sheet: ${spreadsheetId}`, error);
      throw error;
    }
  }

  /**
   * Clear a range in a sheet
   */
  async clearValues(spreadsheetId: string, range: string): Promise<void> {
    try {
      await this.sheets.spreadsheets.values.clear({
        spreadsheetId,
        range
      });

      logger.info(`Cleared sheet ${spreadsheetId} range ${range}`);
    } catch (error) {
      logger.error(`Failed to clear sheet: ${spreadsheetId}`, error);
      throw error;
    }
  }

  /**
   * Get sheet metadata (titles, properties)
   */
  async getSpreadsheetMetadata(spreadsheetId: string): Promise<any> {
    try {
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId
      });

      return response.data;
    } catch (error) {
      logger.error(`Failed to get metadata for sheet: ${spreadsheetId}`, error);
      throw error;
    }
  }

  /**
   * Add a new sheet
   */
  async addSheet(
    spreadsheetId: string,
    sheetTitle: string
  ): Promise<number> {
    try {
      const response = await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: sheetTitle
                }
              }
            }
          ]
        }
      });

      const sheetId = response.data.replies[0].addSheet.properties.sheetId;
      logger.info(`Added sheet ${sheetTitle} with ID ${sheetId}`);
      return sheetId;
    } catch (error) {
      logger.error(`Failed to add sheet: ${sheetTitle}`, error);
      throw error;
    }
  }

  /**
   * Convert data to CSV-like format for sheets
   */
  convertToSheetFormat(data: any[]): any[][] {
    if (data.length === 0) return [];

    const headers = Object.keys(data[0]);
    const rows = [headers, ...data.map((item) => headers.map((h) => item[h]))];

    return rows;
  }

  /**
   * Convert sheet data to objects
   */
  convertFromSheetFormat(values: any[][]): any[] {
    if (values.length < 2) return [];

    const headers = values[0];
    return values.slice(1).map((row) => {
      const obj: any = {};
      headers.forEach((header, i) => {
        obj[header] = row[i];
      });
      return obj;
    });
  }
}

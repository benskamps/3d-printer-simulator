import {
  ParsedGCodeLine,
  GCodeModelSummary,
  BoundingBox,
} from './types';
import { ToolpathType } from '../kinematics/types';

export class GCodeParser {
  // Modal tracking state for parsing
  private modalFeedrate: number = 3000;
  private modalX: number = 0;
  private modalY: number = 0;
  private modalZ: number = 0;
  private modalE: number = 0;
  private isRelativePositioning: boolean = false; // G90 = false, G91 = true
  private isRelativeExtruder: boolean = false;    // M82 = false, M83 = true
  private currentToolpathType: ToolpathType = ToolpathType.WALL_OUTER;

  constructor() {
    this.resetModalState();
  }

  public resetModalState(): void {
    this.modalFeedrate = 3000;
    this.modalX = 0;
    this.modalY = 0;
    this.modalZ = 0;
    this.modalE = 0;
    this.isRelativePositioning = false;
    this.isRelativeExtruder = false;
    this.currentToolpathType = ToolpathType.WALL_OUTER;
  }

  /**
   * Parses a single raw G-code line string into a structured ParsedGCodeLine.
   * Returns null if line is empty or comment-only.
   */
  public parseLine(rawLine: string): ParsedGCodeLine | null {
    if (!rawLine) return null;

    let line = rawLine.trim();
    if (line.length === 0) return null;

    let comment: string | undefined;

    // 1. Extract and strip parenthetical comments: (comment)
    line = line.replace(/\(([^)]*)\)/g, (_match, parenComment) => {
      comment = comment ? `${comment} ${parenComment}` : parenComment;
      return ' ';
    }).trim();

    // 2. Extract and strip semicolon or double-slash comments
    const commentMatch = line.match(/(;|\/\/)(.*)$/);
    if (commentMatch) {
      const strippedComment = commentMatch[2].trim();
      comment = comment ? `${comment}; ${strippedComment}` : strippedComment;
      line = line.substring(0, commentMatch.index).trim();
    }

    // Inspect comment for slicer feature type tags
    if (comment) {
      this.detectFeatureTypeFromComment(comment);
    }

    if (line.length === 0) return null;

    // 3. Strip and extract checksum (*NN)
    const checksumMatch = line.match(/\*(\d+)/);
    if (checksumMatch) {
      line = line.substring(0, checksumMatch.index).trim();
    }

    // 4. Strip and extract line number (N<int>)
    let lineNumber: number | undefined;
    const lineNumMatch = line.match(/^N(\d+)\s*/i);
    if (lineNumMatch) {
      lineNumber = parseInt(lineNumMatch[1], 10);
      line = line.substring(lineNumMatch[0].length).trim();
    }

    if (line.length === 0) return null;

    // 5. Special handling for commands with string payloads (e.g. M117 LCD text)
    const m117Match = line.match(/^M117(\s+(.*))?$/i);
    if (m117Match) {
      return {
        originalLine: rawLine,
        lineNumber,
        command: 'M117',
        parameters: {},
        stringParameter: m117Match[2] ? m117Match[2].trim() : '',
        comment,
        isExtruding: false,
        isRetracting: false,
        isTravel: false,
      };
    }

    // 6. Tokenize primary command (e.g., G0, G1, M104, etc.)
    const commandMatch = line.match(/^([A-Za-z]\d+(?:\.\d+)?)/);
    if (!commandMatch) {
      // Line might be an isolated parameter or unknown format
      return null;
    }

    const command = commandMatch[1].toUpperCase();
    const paramSubstring = line.substring(commandMatch[0].length).trim();

    // 7. Tokenize parameters (e.g., X10.5, Y -20.25, F 3000)
    const parameters: Record<string, number> = {};
    const paramRegex = /([A-Za-z])\s*([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)/g;
    let match: RegExpExecArray | null;

    while ((match = paramRegex.exec(paramSubstring)) !== null) {
      const letter = match[1].toUpperCase();
      const value = parseFloat(match[2]);
      if (!isNaN(value)) {
        parameters[letter] = value;
      }
    }

    // 8. Update modal states and determine extrusion/travel nature
    let isExtruding = false;
    let isRetracting = false;
    let isTravel = false;
    let deltaE = 0;

    if (command === 'G0' || command === 'G1') {
      if (parameters.F !== undefined && parameters.F > 0) {
        this.modalFeedrate = parameters.F;
      }

      // Calculate target X, Y, Z
      let targetX = this.modalX;
      let targetY = this.modalY;
      let targetZ = this.modalZ;

      if (this.isRelativePositioning) {
        targetX += parameters.X ?? 0;
        targetY += parameters.Y ?? 0;
        targetZ += parameters.Z ?? 0;
      } else {
        if (parameters.X !== undefined) targetX = parameters.X;
        if (parameters.Y !== undefined) targetY = parameters.Y;
        if (parameters.Z !== undefined) targetZ = parameters.Z;
      }

      // Calculate extrusion delta
      if (this.isRelativeExtruder) {
        deltaE = parameters.E ?? 0;
        this.modalE += deltaE;
      } else {
        if (parameters.E !== undefined) {
          deltaE = parameters.E - this.modalE;
          this.modalE = parameters.E;
        }
      }

      this.modalX = targetX;
      this.modalY = targetY;
      this.modalZ = targetZ;

      if (deltaE > 0.00001) {
        isExtruding = true;
      } else if (deltaE < -0.00001) {
        isRetracting = true;
      } else {
        isTravel = true;
      }
    } else if (command === 'G90') {
      this.isRelativePositioning = false;
    } else if (command === 'G91') {
      this.isRelativePositioning = true;
    } else if (command === 'M82') {
      this.isRelativeExtruder = false;
    } else if (command === 'M83') {
      this.isRelativeExtruder = true;
    } else if (command === 'G92') {
      // Coordinate reset without physical movement
      if (parameters.X !== undefined) this.modalX = parameters.X;
      if (parameters.Y !== undefined) this.modalY = parameters.Y;
      if (parameters.Z !== undefined) this.modalZ = parameters.Z;
      if (parameters.E !== undefined) this.modalE = parameters.E;
    } else if (command === 'G28') {
      // Homing
      const homeAll = parameters.X === undefined && parameters.Y === undefined && parameters.Z === undefined;
      if (homeAll || parameters.X !== undefined) this.modalX = 0;
      if (homeAll || parameters.Y !== undefined) this.modalY = 0;
      if (homeAll || parameters.Z !== undefined) this.modalZ = 0;
      isTravel = true;
    }

    return {
      originalLine: rawLine,
      lineNumber,
      command,
      parameters,
      comment,
      isExtruding,
      isRetracting,
      isTravel,
      toolpathType: this.currentToolpathType,
      deltaE,
    };
  }

  /**
   * Inspects slicer comment for toolpath type tag
   */
  private detectFeatureTypeFromComment(comment: string): void {
    const upper = comment.toUpperCase();
    if (upper.includes('WALL-OUTER') || upper.includes('OUTER WALL') || upper.includes('PERIMETER')) {
      this.currentToolpathType = ToolpathType.WALL_OUTER;
    } else if (upper.includes('WALL-INNER') || upper.includes('INNER WALL')) {
      this.currentToolpathType = ToolpathType.WALL_INNER;
    } else if (upper.includes('SKIN') || upper.includes('SOLID INFILL') || upper.includes('TOP/BOTTOM')) {
      this.currentToolpathType = ToolpathType.SOLID_SURFACE;
    } else if (upper.includes('FILL') || upper.includes('INFILL')) {
      this.currentToolpathType = ToolpathType.INFILL;
    } else if (upper.includes('SUPPORT')) {
      this.currentToolpathType = ToolpathType.SUPPORT;
    } else if (upper.includes('SKIRT') || upper.includes('BRIM')) {
      this.currentToolpathType = ToolpathType.SKIRT_BRIM;
    } else if (upper.includes('PRIME-TOWER') || upper.includes('PRIME TOWER')) {
      this.currentToolpathType = ToolpathType.PRIME_TOWER;
    }
  }

  public getCurrentToolpathType(): ToolpathType {
    return this.currentToolpathType;
  }

  /**
   * Parses an entire G-code document string and generates a comprehensive summary.
   */
  public parseDocument(
    gcodeText: string,
    fileName: string = 'model.gcode'
  ): {
    parsedLines: ParsedGCodeLine[];
    summary: GCodeModelSummary;
  } {
    this.resetModalState();

    const rawLines = gcodeText.split(/\r?\n/);
    const parsedLines: ParsedGCodeLine[] = [];

    const boundingBox: BoundingBox = {
      minX: Infinity,
      maxX: -Infinity,
      minY: Infinity,
      maxY: -Infinity,
      minZ: Infinity,
      maxZ: -Infinity,
    };

    let totalFilamentMm = 0;
    let estimatedMotionSeconds = 0;
    let estimatedHeatSeconds = 0;
    let docPrevX = 0;
    let docPrevY = 0;
    let docPrevZ = 0;

    const layerHeights: number[] = [];
    const layerStartIndices: number[] = [];
    const layerIndicesRecorded = new Set<number>();

    const hasExplicitLayerComments = /;\s*LAYER[:\s]+\d+/i.test(gcodeText);
    let pendingLayerIndex: number | null = null;
    let currentLayer = 0;

    for (let i = 0; i < rawLines.length; i++) {
      const rawLine = rawLines[i];

      // Check for explicit layer comments in raw line
      const layerCommentMatch = rawLine.match(/;\s*LAYER[:\s]+(\d+)/i);
      if (layerCommentMatch) {
        pendingLayerIndex = parseInt(layerCommentMatch[1], 10);
        currentLayer = pendingLayerIndex;
      }

      const parsed = this.parseLine(rawLine);
      if (!parsed) continue;

      parsed.layerIndex = currentLayer;
      parsedLines.push(parsed);

      // Handle layer registration
      if (hasExplicitLayerComments) {
        if (pendingLayerIndex !== null) {
          if (!layerIndicesRecorded.has(pendingLayerIndex)) {
            layerIndicesRecorded.add(pendingLayerIndex);
            layerHeights.push(this.modalZ);
            layerStartIndices.push(parsedLines.length - 1);
          }
          pendingLayerIndex = null;
        } else if (layerHeights.length > 0 && Math.abs(layerHeights[layerHeights.length - 1]) < 0.001 && this.modalZ > 0) {
          layerHeights[layerHeights.length - 1] = this.modalZ;
        }
      } else {
        // Fallback for files without explicit ;LAYER comments: detect from extrusion moves at new Z height
        if (parsed.isExtruding && this.modalZ > 0 && !layerHeights.some((z) => Math.abs(z - this.modalZ) < 0.001)) {
          layerHeights.push(this.modalZ);
          currentLayer = layerHeights.length - 1;
          parsed.layerIndex = currentLayer;
          layerStartIndices.push(parsedLines.length - 1);
        }
      }

      // Track bounding box and filament consumption for extrusion moves
      if (parsed.command === 'G0' || parsed.command === 'G1') {
        if (parsed.isExtruding) {
          // Bounding box only includes extruded points
          if (this.modalX !== undefined) {
            boundingBox.minX = Math.min(boundingBox.minX, this.modalX);
            boundingBox.maxX = Math.max(boundingBox.maxX, this.modalX);
          }
          if (this.modalY !== undefined) {
            boundingBox.minY = Math.min(boundingBox.minY, this.modalY);
            boundingBox.maxY = Math.max(boundingBox.maxY, this.modalY);
          }
          if (this.modalZ !== undefined) {
            boundingBox.minZ = Math.min(boundingBox.minZ, this.modalZ);
            boundingBox.maxZ = Math.max(boundingBox.maxZ, this.modalZ);
          }

          // Accumulate filament consumption for all positive extrusions across document
          if ((parsed.deltaE ?? 0) > 0) {
            totalFilamentMm += parsed.deltaE!;
          }
        }

        // Estimate motion duration using delta displacement
        const dx = this.modalX - docPrevX;
        const dy = this.modalY - docPrevY;
        const dz = this.modalZ - docPrevZ;
        const dist = Math.hypot(dx, dy, dz);
        const v = Math.max(1, this.modalFeedrate / 60);
        if (dist > 0) {
          estimatedMotionSeconds += dist / v;
        } else if (Math.abs(parsed.deltaE ?? 0) > 0) {
          const retractSpeed = Math.min(v, 40);
          estimatedMotionSeconds += Math.abs(parsed.deltaE ?? 0) / Math.max(0.1, retractSpeed);
        }
        docPrevX = this.modalX;
        docPrevY = this.modalY;
        docPrevZ = this.modalZ;
      } else if (parsed.command === 'G28') {
        const dx = this.modalX - docPrevX;
        const dy = this.modalY - docPrevY;
        const dz = this.modalZ - docPrevZ;
        const dist = Math.hypot(dx, dy, dz);
        const v = Math.max(1, this.modalFeedrate / 60);
        if (dist > 0) {
          estimatedMotionSeconds += dist / v;
        }
        docPrevX = this.modalX;
        docPrevY = this.modalY;
        docPrevZ = this.modalZ;
      } else if (parsed.command === 'G92') {
        docPrevX = this.modalX;
        docPrevY = this.modalY;
        docPrevZ = this.modalZ;
      } else if (parsed.command === 'M109' || parsed.command === 'M190') {
        // Temperature wait: estimate ~30 to 60 seconds heating
        estimatedHeatSeconds += 30;
      } else if (parsed.command === 'G4') {
        // Dwell
        if (parsed.parameters.P !== undefined) {
          estimatedMotionSeconds += parsed.parameters.P / 1000;
        } else if (parsed.parameters.S !== undefined) {
          estimatedMotionSeconds += parsed.parameters.S;
        }
      }
    }

    // Calculate filament mass in grams for 1.75mm PLA (density ~1.24 g/cm3)
    // radius = 1.75 / 2 = 0.875 mm
    // cross section = pi * r^2 = 2.40528 mm2
    // volume = length * cross section (mm3) = cm3 * 1000
    // mass = volume (cm3) * 1.24 g/cm3
    const filamentRadiusMm = 1.75 / 2;
    const filamentAreaMm2 = Math.PI * filamentRadiusMm * filamentRadiusMm;
    const totalFilamentVolumeMm3 = totalFilamentMm * filamentAreaMm2;
    const totalFilamentGrams = (totalFilamentVolumeMm3 / 1000) * 1.24;

    // Sanitize bounding box if no extrusion occurred
    if (boundingBox.minX === Infinity) {
      boundingBox.minX = 0;
      boundingBox.maxX = 0;
      boundingBox.minY = 0;
      boundingBox.maxY = 0;
      boundingBox.minZ = 0;
      boundingBox.maxZ = 0;
    }

    if (layerHeights.length === 0) {
      layerHeights.push(0);
      layerStartIndices.push(0);
    }

    // Acceleration overhead factor ~ 12%
    const estimatedPrintTimeSeconds = Math.round((estimatedMotionSeconds * 1.12) + estimatedHeatSeconds);

    const summary: GCodeModelSummary = {
      fileName,
      totalLines: parsedLines.length,
      totalLayers: layerHeights.length,
      boundingBox,
      totalFilamentMm: Math.round(totalFilamentMm * 100) / 100,
      totalFilamentGrams: Math.round(totalFilamentGrams * 100) / 100,
      estimatedPrintTimeSeconds,
      layerHeights,
      layerStartIndices,
    };

    return { parsedLines, summary };
  }
}

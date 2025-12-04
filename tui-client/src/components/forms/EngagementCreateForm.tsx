import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { CreateEngagementRequest } from '../../types/api.js';
import { useInputContext } from '../../context/InputContext.js';

interface EngagementCreateFormProps {
  onSubmit: (data: CreateEngagementRequest) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

type FormField = 'name' | 'sector' | 'deal_type' | 'location';

const SECTORS = [
  'technology',
  'healthcare',
  'financial_services',
  'consumer',
  'industrial',
  'energy',
  'real_estate',
  'other',
];

const DEAL_TYPES: Array<'buyout' | 'growth' | 'venture' | 'bolt-on'> = [
  'buyout',
  'growth',
  'venture',
  'bolt-on',
];

export function EngagementCreateForm({
  onSubmit,
  onCancel,
  isSubmitting = false,
}: EngagementCreateFormProps): React.ReactElement {
  const [currentField, setCurrentField] = useState<FormField>('name');
  const [formData, setFormData] = useState({
    name: '',
    sector: '',
    deal_type: '',
    location: '',
  });
  const [sectorIndex, setSectorIndex] = useState(0);
  const [dealTypeIndex, setDealTypeIndex] = useState(0);
  const { setInputActive } = useInputContext();

  // Text input is active when currentField is 'name' or 'location' (text fields)
  const isTextInputActive = currentField === 'name' || currentField === 'location';

  // Sync text input state with global input state to disable app hotkeys
  useEffect(() => {
    setInputActive(isTextInputActive);
    return () => setInputActive(false);
  }, [isTextInputActive, setInputActive]);

  // Handle field navigation
  useInput((input, key) => {
    if (isSubmitting) return;

    // Cancel with Escape
    if (key.escape) {
      onCancel();
      return;
    }

    // Submit with Ctrl+S
    if (key.ctrl && input === 's') {
      handleSubmit();
      return;
    }

    // Navigation for dropdown fields
    if (currentField === 'sector') {
      if (key.upArrow && sectorIndex > 0) {
        setSectorIndex(sectorIndex - 1);
      } else if (key.downArrow && sectorIndex < SECTORS.length - 1) {
        setSectorIndex(sectorIndex + 1);
      } else if (key.return) {
        setFormData({ ...formData, sector: SECTORS[sectorIndex] || 'other' });
        setCurrentField('deal_type');
      }
    } else if (currentField === 'deal_type') {
      if (key.upArrow && dealTypeIndex > 0) {
        setDealTypeIndex(dealTypeIndex - 1);
      } else if (key.downArrow && dealTypeIndex < DEAL_TYPES.length - 1) {
        setDealTypeIndex(dealTypeIndex + 1);
      } else if (key.return) {
        setFormData({ ...formData, deal_type: DEAL_TYPES[dealTypeIndex] || 'buyout' });
        setCurrentField('location');
      }
    }
  });

  const handleFieldChange = (field: FormField, value: string) => {
    setFormData({ ...formData, [field]: value });
  };

  const handleFieldSubmit = () => {
    if (currentField === 'name' && formData.name.trim()) {
      setCurrentField('sector');
    } else if (currentField === 'location') {
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      return;
    }

    const target: CreateEngagementRequest['target'] = {
      name: formData.name,
      sector: formData.sector || 'other',
    };

    // Only add location if it has a value
    if (formData.location.trim()) {
      target.location = formData.location;
    }

    const request: CreateEngagementRequest = {
      name: `Deal with ${formData.name}`,
      target,
      deal_type: (formData.deal_type as CreateEngagementRequest['deal_type']) || 'buyout',
    };

    onSubmit(request);
  };

  return (
    <Box flexDirection="column" paddingY={1}>
      {/* Form Title */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Create New Engagement
        </Text>
      </Box>

      {/* Divider */}
      <Box marginBottom={1}>
        <Text color="gray">{'─'.repeat(60)}</Text>
      </Box>

      {/* Target Company Name */}
      <Box flexDirection="column" marginBottom={1}>
        <Box marginBottom={1}>
          <Text color={currentField === 'name' ? 'cyan' : 'gray'}>
            Target Company Name {currentField === 'name' ? '*' : ''}
          </Text>
        </Box>
        <Box>
          {currentField === 'name' ? (
            <TextInput
              value={formData.name}
              onChange={(value) => handleFieldChange('name', value)}
              onSubmit={handleFieldSubmit}
              placeholder="e.g., Acme Corporation"
            />
          ) : (
            <Text color="white">{formData.name || '(not set)'}</Text>
          )}
        </Box>
      </Box>

      {/* Sector */}
      <Box flexDirection="column" marginBottom={1}>
        <Box marginBottom={1}>
          <Text color={currentField === 'sector' ? 'cyan' : 'gray'}>
            Sector {currentField === 'sector' ? '(↑↓ to navigate, Enter to select)' : ''}
          </Text>
        </Box>
        {currentField === 'sector' ? (
          <Box flexDirection="column">
            {SECTORS.map((sector, idx) => (
              <Box key={sector}>
                {idx === sectorIndex ? (
                  <Text color="cyan" bold>
                    ▸ {sector}
                  </Text>
                ) : (
                  <Text color="gray">  {sector}</Text>
                )}
              </Box>
            ))}
          </Box>
        ) : (
          <Box>
            <Text color="white">{formData.sector || '(not set)'}</Text>
          </Box>
        )}
      </Box>

      {/* Deal Type */}
      <Box flexDirection="column" marginBottom={1}>
        <Box marginBottom={1}>
          <Text color={currentField === 'deal_type' ? 'cyan' : 'gray'}>
            Deal Type {currentField === 'deal_type' ? '(↑↓ to navigate, Enter to select)' : ''}
          </Text>
        </Box>
        {currentField === 'deal_type' ? (
          <Box flexDirection="column">
            {DEAL_TYPES.map((type, idx) => (
              <Box key={type}>
                {idx === dealTypeIndex ? (
                  <Text color="cyan" bold>
                    ▸ {type}
                  </Text>
                ) : (
                  <Text color="gray">  {type}</Text>
                )}
              </Box>
            ))}
          </Box>
        ) : (
          <Box>
            <Text color="white">{formData.deal_type || '(not set)'}</Text>
          </Box>
        )}
      </Box>

      {/* Location */}
      <Box flexDirection="column" marginBottom={1}>
        <Box marginBottom={1}>
          <Text color={currentField === 'location' ? 'cyan' : 'gray'}>
            Location (optional) {currentField === 'location' ? '(Enter to submit)' : ''}
          </Text>
        </Box>
        <Box>
          {currentField === 'location' ? (
            <TextInput
              value={formData.location}
              onChange={(value) => handleFieldChange('location', value)}
              onSubmit={handleFieldSubmit}
              placeholder="e.g., New York, NY"
            />
          ) : (
            <Text color="white">{formData.location || '(not set)'}</Text>
          )}
        </Box>
      </Box>

      {/* Status/Instructions */}
      {isSubmitting ? (
        <Box marginTop={1}>
          <Text color="yellow">Creating engagement...</Text>
        </Box>
      ) : (
        <Box marginTop={1} borderStyle="round" borderColor="gray" paddingX={1}>
          <Text color="gray">
            [Ctrl+S] Submit  [Esc] Cancel
          </Text>
        </Box>
      )}
    </Box>
  );
}

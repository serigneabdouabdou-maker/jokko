---
dataset_info:
  features:
  - name: en
    dtype: string
  - name: wo
    dtype: string
  - name: non_standardized
    dtype: string
  splits:
  - name: train
    num_bytes: 987034
    num_examples: 3438
  download_size: 628749
  dataset_size: 987034
configs:
- config_name: default
  data_files:
  - split: train
    path: data/train-*
license: cc-by-sa-4.0
task_categories:
- translation
- text-generation
language:
- wo
- en
pretty_name: 'Wolof Non-Standard to Standard Parallel Pairs '
size_categories:
- 1K<n<10K
---

# Dataset Description

## Dataset Summary
This dataset contains pairs of non-standard and standard Wolof text, designed for training models to normalize informal Wolof writing found on social media, messaging apps, and online platforms. 
The non-standard versions simulate real-world informal Wolof text with French code-switching, phonetic spellings, missing diacritics, and common typing variations.
The original Standard Wolof and English sentences are extracted from **galsenai/english-wolof-smol-translation**

## Dataset Structure

### Data Fields
- `wo`: Standard Wolof text following official orthography with proper diacritics
- `non_standard`: Synthetically generated informal/noisy version mimicking social media writing
- `en`: English translation of the standard text 

### Data Splits
This dataset contains a single training split with synthetic examples generated from standard Wolof sentences.

## Data Generation
The dataset was generated synthetically by prompting **Oolel** to transform standard Wolof sentences into realistic non-standard variations. The generation process was guided by:

- Real-world patterns observed in authentic Wolof social media comments and messaging
- Linguistic transformation rules including:
    - Diacritic removal and phonetic approximations
    - French/English loanword preservation in original form
    - Character substitutions (ñ→gn, x→kh, etc.)
    - Word merging and phonetic spelling patterns
    - Natural French code-switching
- Authentic examples from YouTube comments, social media posts, and messaging platforms to ensure realistic noise patterns

The generation prioritizes authenticity by learning from real informal Wolof writing patterns while maintaining the semantic meaning of the original standard text.

## Dataset Use
### Intended Use
This dataset is intended for:

- Training text normalization models for Wolof
- Developing spelling correction systems for informal Wolof
- Research on code-switching and informal writing in African languages
- Creating robust Wolof language models that can handle real-world text (bpth formal and informal text)

### Out-of-Scope Use
This dataset should not be used for:

- Using the `non_standard` field as a reference for correct Wolof orthography.
- Direct translation tasks without normalization

## Considerations
### Social Impact

This dataset supports the development of NLP tools for Wolof, a widely spoken but under-represented West African language. 
By enabling models to process informal social media text, it can:

- Improve accessibility of Wolof language technology
- Support content moderation and analysis of Wolof social media
- Enable better machine translation from informal Wolof text
- Document informal language use patterns

### Limitations

- The non-standard text is synthetically generated and may not capture all real-world variation
- Code-switching patterns focus on French, with limited English mixing

## Citation

```bibtext
@dataset{Wolof-Non-Standard-Orthography,
  title={Wolof Non-Standard to Standard Parallel Pairs },
  author={[soynade-research/wolof-nonstandard-standard},
  year={2026},
  publisher={Hugging Face},
  howpublished={\url{https://huggingface.co/datasets/soynade-research/Wolof-Non-Standard-Orthography}}
}
```